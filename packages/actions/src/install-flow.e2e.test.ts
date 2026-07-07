/**
 * End-to-end test of the Fleet pack **install flow** for `coinpay-invoice`.
 *
 * Drives the exact pipeline the install route
 * (`api/v1/github/installations/[id]/repos/[repoId]/actions/[actionId]/install`)
 * runs — catalog lookup → renderPack → openPackPullRequest — against a
 * simulated GitHub REST API (global `fetch` is stubbed). The only things not
 * exercised here are the route's auth / Supabase repo lookup / installation-token
 * mint, which are platform plumbing, not the pack flow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openPackPullRequest, renderPack } from '@profullstack/sh1pt-actions-fleet-core';
import { loadBuiltinPacks } from './index.js';

const OWNER = 'acme';
const REPO = 'target';
const BASE = 'main';
const API = 'https://api.github.com';

interface RecordedCall {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A minimal in-memory GitHub REST server covering the endpoints
 * openPackPullRequest touches. `existingFile` simulates what's already at the
 * destination path on the base ref (null = file absent).
 */
function makeGithubMock() {
  const calls: RecordedCall[] = [];
  const state: { existingFile: { content: string; sha: string } | null } = { existingFile: null };
  let putContent: string | null = null;
  let prBody: { title: string; head: string; base: string; body?: string; draft?: boolean } | null = null;

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.startsWith(API) ? url.slice(API.length) : url;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });

    // getFile: GET /repos/{o}/{r}/contents/<path>?ref=<base>
    if (method === 'GET' && path.includes('/contents/')) {
      if (state.existingFile) {
        return json(200, {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(state.existingFile.content, 'utf8').toString('base64'),
          sha: state.existingFile.sha,
          path: '.github/workflows/coinpay.yml',
        });
      }
      return json(404, { message: 'Not Found' });
    }
    // getBranchSha: GET /repos/{o}/{r}/git/ref/heads/<base>
    if (method === 'GET' && path.includes('/git/ref/heads/')) {
      return json(200, { ref: `refs/heads/${BASE}`, object: { sha: 'base-sha-000', type: 'commit' } });
    }
    // createBranch: POST /repos/{o}/{r}/git/refs
    if (method === 'POST' && path.endsWith('/git/refs')) {
      return json(201, { ref: body.ref, object: { sha: body.sha, type: 'commit' } });
    }
    // upsertFile: PUT /repos/{o}/{r}/contents/<path>
    if (method === 'PUT' && path.includes('/contents/')) {
      putContent = Buffer.from(body.content, 'base64').toString('utf8');
      return json(201, {
        content: { sha: 'new-file-sha', path: '.github/workflows/coinpay.yml' },
        commit: { sha: 'commit-sha', html_url: `https://github.com/${OWNER}/${REPO}/commit/commit-sha` },
      });
    }
    // createPullRequest: POST /repos/{o}/{r}/pulls
    if (method === 'POST' && path.endsWith('/pulls')) {
      prBody = body;
      return json(201, { number: 4242, html_url: `https://github.com/${OWNER}/${REPO}/pull/4242`, state: 'open' });
    }
    return json(500, { message: `unhandled ${method} ${path}` });
  });

  return {
    fetchMock,
    calls,
    state,
    get putContent() {
      return putContent;
    },
    get prBody() {
      return prBody;
    },
  };
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function renderCoinpay(inputs: Record<string, string> = {}) {
  const catalog = await loadBuiltinPacks();
  const entry = catalog.get('coinpay-invoice');
  if (!entry) throw new Error('coinpay-invoice not in catalog');
  const render = await renderPack({ packDir: entry.packDir, manifest: entry.manifest, inputs });
  return { manifest: entry.manifest, render };
}

describe('coinpay-invoice install flow (end to end)', () => {
  const realFetch = globalThis.fetch;
  let gh: ReturnType<typeof makeGithubMock>;

  beforeEach(() => {
    gh = makeGithubMock();
    globalThis.fetch = gh.fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('opens a PR that writes .github/workflows/coinpay.yml into a fresh repo', async () => {
    const { manifest, render } = await renderCoinpay();
    gh.state.existingFile = null; // file does not exist yet

    const outcome = await openPackPullRequest({
      client: { token: 'ghs_installation_token' },
      owner: OWNER,
      repo: REPO,
      manifest,
      render,
      baseBranch: BASE,
    });

    // Outcome
    expect(outcome.kind).toBe('opened');
    if (outcome.kind !== 'opened') throw new Error('expected opened');
    expect(outcome.number).toBe(4242);
    expect(outcome.pullRequestUrl).toBe(`https://github.com/${OWNER}/${REPO}/pull/4242`);
    expect(outcome.branch).toMatch(/^sh1pt\/actions\/coinpay-invoice\/\d{8}-\d{6}$/);

    // The committed workflow is the fully-rendered coinpaybot wiring.
    expect(gh.putContent).toContain('# Managed by sh1pt Actions Fleet');
    expect(gh.putContent).toContain('# pack: coinpay-invoice@1.0.0');
    expect(gh.putContent).toContain('uses: profullstack/coinpaybot@v0');
    expect(gh.putContent).toContain('coinpay-api-key: ${{ secrets.COINPAY_API_KEY }}');
    expect(gh.putContent).toContain("if: startsWith(github.event.comment.body, '/coinpay')");

    // The PR is authored with the pack's identity and lists the required secrets.
    expect(gh.prBody?.title).toContain('CoinPayPortal Invoice Bot');
    expect(gh.prBody?.base).toBe(BASE);
    expect(gh.prBody?.head).toBe(outcome.branch);
    expect(gh.prBody?.body).toContain('COINPAY_API_KEY');
    expect(gh.prBody?.body).toContain('COINPAY_BUSINESS_ID');

    // Correct API call sequence: read file → base sha → create branch → put file → open PR.
    const seq = gh.calls.map((c) => `${c.method} ${c.path.replace(`/repos/${OWNER}/${REPO}`, '')}`);
    expect(seq[0]).toMatch(/^GET \/contents\/\.github\/workflows\/coinpay\.yml/);
    expect(seq).toContain(`GET /git/ref/heads/${BASE}`);
    expect(seq).toContain('POST /git/refs');
    expect(seq.some((s) => s.startsWith('PUT /contents/'))).toBe(true);
    expect(seq[seq.length - 1]).toBe('POST /pulls');
  });

  it('is idempotent: re-installing the same version opens no PR (unchanged)', async () => {
    const { manifest, render } = await renderCoinpay();
    // The destination already holds exactly what the pack renders.
    gh.state.existingFile = { content: render.files[0]!.content, sha: 'existing-sha' };

    const outcome = await openPackPullRequest({
      client: { token: 't' },
      owner: OWNER,
      repo: REPO,
      manifest,
      render,
      baseBranch: BASE,
    });

    expect(outcome.kind).toBe('unchanged');
    // No branch/PR side effects.
    expect(gh.calls.some((c) => c.method === 'POST' && c.path.endsWith('/pulls'))).toBe(false);
    expect(gh.calls.some((c) => c.method === 'POST' && c.path.endsWith('/git/refs'))).toBe(false);
  });

  it('refuses to clobber a hand-written workflow at the same path (conflict)', async () => {
    const { manifest, render } = await renderCoinpay();
    // An unmanaged file (no sh1pt header) already lives at the destination.
    gh.state.existingFile = { content: 'name: my own workflow\non: push\n', sha: 'user-sha' };

    const outcome = await openPackPullRequest({
      client: { token: 't' },
      owner: OWNER,
      repo: REPO,
      manifest,
      render,
      baseBranch: BASE,
    });

    expect(outcome.kind).toBe('conflict');
    expect(gh.calls.some((c) => c.method === 'POST' && c.path.endsWith('/pulls'))).toBe(false);
  });

  it('respects an overridden action ref end to end', async () => {
    const { manifest, render } = await renderCoinpay({ actionRef: 'profullstack/coinpaybot@v0.1.0' });
    gh.state.existingFile = null;

    const outcome = await openPackPullRequest({
      client: { token: 't' },
      owner: OWNER,
      repo: REPO,
      manifest,
      render,
      baseBranch: BASE,
    });

    expect(outcome.kind).toBe('opened');
    expect(gh.putContent).toContain('uses: profullstack/coinpaybot@v0.1.0');
  });
});
