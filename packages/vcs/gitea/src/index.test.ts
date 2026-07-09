import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestVcs } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestVcs(adapter, {
  sampleConfig: { host: 'codeberg.org', owner: 'acme', repo: 'my-app' },
  requiredSecrets: ['GITEA_TOKEN'],
});

describe('vcs-gitea REST API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates releases through the Gitea API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 101,
      tag_name: 'v1.0.0',
      html_url: 'https://codeberg.org/acme/my-app/releases/tag/v1.0.0',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const release = await adapter.createRelease(ctx(), {
      tag: 'v1.0.0',
      name: 'Version 1',
      body: 'Release notes',
      targetCommitish: 'main',
      prerelease: true,
    }, sampleConfig());

    expect(fetchMock).toHaveBeenCalledWith('https://codeberg.org/api/v1/repos/acme/my-app/releases', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'token gitea-token' }),
    }));
    expect(requestBody(fetchMock)).toMatchObject({
      tag_name: 'v1.0.0',
      target_commitish: 'main',
      name: 'Version 1',
      body: 'Release notes',
      draft: false,
      prerelease: true,
    });
    expect(release).toEqual({
      id: '101',
      tag: 'v1.0.0',
      url: 'https://codeberg.org/acme/my-app/releases/tag/v1.0.0',
      uploadedAssets: [],
    });
  });

  it('creates pull requests and maps merged state', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 222,
      number: 12,
      html_url: 'https://git.example.test/acme/my-app/pulls/12',
      state: 'closed',
      merged: true,
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const pr = await adapter.createPullRequest(ctx(), {
      title: 'Add adapter',
      body: 'Implements API calls.',
      head: 'feature/gitea',
      base: 'master',
      draft: true,
      labels: ['ignored-by-gitea-create-pull'],
    }, { host: 'https://git.example.test/', owner: 'acme', repo: 'my-app' });

    expect(fetchMock).toHaveBeenCalledWith('https://git.example.test/api/v1/repos/acme/my-app/pulls', expect.any(Object));
    expect(requestBody(fetchMock)).toMatchObject({
      head: 'feature/gitea',
      base: 'master',
      title: 'Add adapter',
      body: 'Implements API calls.',
      draft: true,
    });
    expect(pr).toEqual({
      id: '222',
      number: 12,
      state: 'merged',
      url: 'https://git.example.test/acme/my-app/pulls/12',
    });
  });

  it('creates issues with numeric label IDs and assignees', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 303,
      number: 5,
      html_url: 'https://codeberg.org/acme/my-app/issues/5',
      state: 'open',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const issue = await adapter.createIssue(ctx(), {
      title: 'Track store upload',
      body: 'Need release evidence.',
      labels: ['12', 'not-an-id'],
      assignees: ['octo'],
    }, sampleConfig());

    expect(fetchMock).toHaveBeenCalledWith('https://codeberg.org/api/v1/repos/acme/my-app/issues', expect.any(Object));
    expect(requestBody(fetchMock)).toMatchObject({
      title: 'Track store upload',
      body: 'Need release evidence.',
      labels: [12],
      assignees: ['octo'],
    });
    expect(issue.state).toBe('open');
  });

  it('creates webhooks using the gitea hook type', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 44 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const hook = await adapter.createWebhook(ctx(), {
      url: 'https://example.com/gitea-hook',
      events: ['push', 'pull_request'],
      secret: 'hook-secret',
    }, sampleConfig());

    expect(fetchMock).toHaveBeenCalledWith('https://codeberg.org/api/v1/repos/acme/my-app/hooks', expect.any(Object));
    expect(requestBody(fetchMock)).toMatchObject({
      type: 'gitea',
      active: true,
      events: ['push', 'pull_request'],
      config: {
        url: 'https://example.com/gitea-hook',
        content_type: 'json',
        secret: 'hook-secret',
      },
    });
    expect(hook).toEqual({ id: '44' });
  });

  it('includes Gitea error messages when requests fail', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: 'repository does not exist',
    }), { status: 404, statusText: 'Not Found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.createIssue(ctx(), { title: 'Missing repo' }, sampleConfig()))
      .rejects.toThrow('Gitea POST /repos/acme/my-app/issues failed: 404 repository does not exist');
  });
});

function sampleConfig() {
  return { host: 'codeberg.org', owner: 'acme', repo: 'my-app' };
}

function ctx() {
  return {
    secret: (key: string) => key === 'GITEA_TOKEN' ? 'gitea-token' : undefined,
    log: vi.fn(),
  };
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body));
}
