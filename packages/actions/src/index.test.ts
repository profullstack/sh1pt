import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { renderPack } from '@profullstack/sh1pt-actions-fleet-core';
import { loadBuiltinPacks } from './index.js';

describe('built-in packs', () => {
  it('loads the node-pnpm-ci pack', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('node-pnpm-ci');
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe('Node pnpm CI');
    expect(entry?.manifest.files[0]?.destination).toBe('.github/workflows/ci.yml');
  });

  it('loads the node-pnpm-test pack', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('node-pnpm-test');
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe('Node pnpm Test');
    expect(entry?.manifest.files[0]?.destination).toBe('.github/workflows/test.yml');
  });

  it('loads the vu1nz-scan pack', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('vu1nz-scan');
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe('vu1nz Security Scan');
    expect(entry?.manifest.files[0]?.destination).toBe('.github/workflows/vu1nz-scan.yml');
    expect(entry?.manifest.secrets[0]?.name).toBe('ENV_FILE');
  });

  it('loads the threatcrush-scan pack', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe('ThreatCrush Security Scan');
    expect(entry?.manifest.files[0]?.destination).toBe('.github/workflows/threatcrush-scan.yml');
    // No secrets: the scanner is entirely local to the runner. A pack that
    // needs no credentials is a pack that can be installed fleet-wide without
    // provisioning anything first.
    expect(entry?.manifest.secrets).toHaveLength(0);
    // One file. The legacy-output converter was removed in 1.7.0 once the
    // pinned CLI could emit SARIF itself; every file a pack writes into
    // somebody else's repository is surface their reviewer has to read.
    expect(entry?.manifest.files.map((f) => f.destination)).toEqual([
      '.github/workflows/threatcrush-scan.yml',
    ]);
  });

  it('loads the coinpay-invoice pack', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('coinpay-invoice');
    expect(entry).toBeDefined();
    expect(entry?.manifest.name).toBe('CoinPayPortal Invoice Bot');
    expect(entry?.manifest.files[0]?.destination).toBe('.github/workflows/coinpay.yml');
    expect(entry?.manifest.policies.installMode).toBe('pull-request');
    expect(entry?.manifest.secrets.map((s) => s.name)).toEqual(['COINPAY_API_KEY', 'COINPAY_BUSINESS_ID']);
  });

  it('renders coinpay-invoice with default inputs', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('coinpay-invoice');
    if (!entry) throw new Error('coinpay-invoice not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const file = result.files[0];
    expect(file?.destination).toBe('.github/workflows/coinpay.yml');
    // Input placeholders substituted...
    expect(file?.content).toContain('uses: profullstack/coinpaybot@v0');
    expect(file?.content).toContain('coinpay-base-url: https://coinpayportal.com');
    // ...while GitHub expressions and secret refs survive untouched.
    expect(file?.content).toContain('${{ secrets.COINPAY_API_KEY }}');
    expect(file?.content).toContain("startsWith(github.event.comment.body, '/coinpay')");
    expect(file?.content).toContain('# Managed by sh1pt Actions Fleet');
  });

  it('honors an overridden action ref', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('coinpay-invoice');
    if (!entry) throw new Error('coinpay-invoice not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: { actionRef: 'profullstack/coinpaybot@v0.1.0' },
    });
    expect(result.files[0]?.content).toContain('uses: profullstack/coinpaybot@v0.1.0');
  });

  it('renders node-pnpm-ci with default inputs', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('node-pnpm-ci');
    if (!entry) throw new Error('node-pnpm-ci not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const file = result.files[0];
    expect(file?.destination).toBe('.github/workflows/ci.yml');
    expect(file?.content).toContain("node-version: '22'");
    expect(file?.content).toContain('pnpm/action-setup@v4');
    // pnpm version comes from package.json's packageManager field, not a pinned input.
    expect(file?.content).not.toContain('version: 9');
    expect(file?.content).toContain('pnpm install --frozen-lockfile');
    // typecheck/test default to --if-present so repos lacking those scripts
    // get a green workflow instead of failing on the first step.
    expect(file?.content).toContain('pnpm run --if-present typecheck');
    expect(file?.content).toContain('pnpm run --if-present test');
    expect(file?.content).toContain('${{ github.workflow }}');
    expect(file?.content).toContain('# Managed by sh1pt Actions Fleet');
  });

  it('honors overridden inputs', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('node-pnpm-ci');
    if (!entry) throw new Error('node-pnpm-ci not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: { nodeVersion: '20', testCommand: 'pnpm run test:ci' },
    });
    const file = result.files[0];
    expect(file?.content).toContain("node-version: '20'");
    expect(file?.content).toContain('pnpm run test:ci');
  });

  it('renders node-pnpm-test with default inputs', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('node-pnpm-test');
    if (!entry) throw new Error('node-pnpm-test not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const file = result.files[0];
    expect(file?.destination).toBe('.github/workflows/test.yml');
    expect(file?.content).toContain('branches: [master]');
    expect(file?.content).toContain('node-version: 22');
    expect(file?.content).toContain('pnpm/action-setup@v4');
    // pnpm version comes from package.json's packageManager field, not a pinned input.
    expect(file?.content).not.toContain('version: 9.12.0');
    expect(file?.content).toContain('pnpm run --if-present test');
    expect(file?.content).toContain('# Managed by sh1pt Actions Fleet');
  });

  it('renders vu1nz-scan with default inputs', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('vu1nz-scan');
    if (!entry) throw new Error('vu1nz-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const file = result.files[0];
    expect(file?.destination).toBe('.github/workflows/vu1nz-scan.yml');
    expect(file?.content).toContain('python-version: "3.12"');
    expect(file?.content).toContain('vu1nz review-pr main');
    expect(file?.content).toContain('${{ secrets.ENV_FILE }}');
    expect(file?.content).toContain('${{ github.repository }}');
    expect(file?.content).toContain('# Managed by sh1pt Actions Fleet');
  });

  it('renders threatcrush-scan report-only by default', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const file = result.files[0];
    expect(file?.destination).toBe('.github/workflows/threatcrush-scan.yml');
    expect(file?.content).toContain('node-version: "20"');
    expect(file?.content).toContain('--format sarif --output threatcrush.sarif');
    // Empty by default, so a first install reports rather than blocks.
    expect(file?.content).toContain('FAIL_ON=""');
    expect(file?.content).toContain('# Managed by sh1pt Actions Fleet');
  });

  it('scopes the pull request comment to the files the pull request changes', async () => {
    // qryptchat-web#258 changed two files and was handed 91 findings, five of
    // them HIGH, none of them from the diff under review. The scan still
    // covers the whole tree and the Security tab still receives all of it —
    // but the comment leads with the change being reviewed, and the standing
    // backlog goes behind a fold.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const content = result.files[0]?.content ?? '';

    // The merge ref's parents are what identify the diff, so the checkout has
    // to be deep enough to have them.
    expect(content).toContain('fetch-depth: 2');
    expect(content).toContain('git diff --name-only HEAD^1 HEAD');
    expect(content).toContain('SCAN_SCOPED: ${{ steps.changed.outputs.scoped }}');
    expect(content).toContain('pre-existing finding(s) elsewhere in the');

    // A conflicted pull request has no merge ref, and `HEAD^1` would then
    // answer a different question. That case must report everything rather
    // than scope to the wrong set of files.
    expect(content).toContain('echo "scoped=false" >> "$GITHUB_OUTPUT"');
  });

  it('still renders valid YAML with the report steps in place', async () => {
    // The report builder is a heredoc'd Python program inside a `run:` block,
    // so an indentation slip there produces a workflow GitHub refuses to load
    // — and every assertion above would still pass on the broken file.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');

    const variants = [
      {},
      { failOn: 'critical,high', commentOnPr: 'true', uploadSarif: 'true' },
      // Both outputs off is the minimum-permission install, and it renders a
      // different `permissions:` block — so it is a different YAML document.
      { commentOnPr: 'false', uploadSarif: 'false' },
    ];
    for (const inputs of variants) {
      const result = await renderPack({ packDir: entry.packDir, manifest: entry.manifest, inputs });
      const workflow = parseYaml(result.files[0]?.content ?? '');
      const steps = workflow?.jobs?.scan?.steps ?? [];
      const names = steps.map((step: { name?: string }) => step?.name);
      expect(names).toContain('Determine which files this pull request touches');
      expect(names).toContain('Build the report');
    }
  });

  it('pins the CLI and its integrity hash to the same version', async () => {
    // These two must move together. A hash left behind from the previous
    // version fails *closed* — the workflow refuses to install and every
    // consumer's scan stops — which is the right direction to fail and a
    // thoroughly confusing one to debug from the job log.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');

    const inputs = entry.manifest.inputs as Record<string, { default?: string }>;
    const spec = inputs.threatcrushPackageSpec?.default ?? '';
    const integrity = inputs.threatcrushIntegrity?.default ?? '';

    expect(spec).toMatch(/^@profullstack\/threatcrush@\d+\.\d+\.\d+$/);
    expect(integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);

    // The README's inputs table quotes both, and a stale table is how someone
    // ends up bumping the spec while reading the old version's hash.
    const readme = await readFile(join(entry.packDir, 'README.md'), 'utf-8');
    const version = spec.split('@').pop();
    expect(readme).toContain(spec);
    expect(readme).toContain(`sha512 of ${version}`);
  });

  it('orders the report by severity rather than by file', async () => {
    // The 50-row cap used to be applied in SARIF order, which is file order,
    // so which findings survived truncation was decided by where they sat in
    // the tree — a HIGH in the last file scanned could be cut while fifty
    // notes from the first were printed in full.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const content = result.files[0]?.content ?? '';
    expect(content).toContain('RANK = {"error": 0, "warning": 1, "note": 2}');
    expect(content).toContain('results.sort(key=lambda r:');
  });

  it('renders threatcrush-scan with a failure gate when asked', async () => {
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: { failOn: 'critical,high' },
    });
    expect(result.files[0]?.content).toContain('FAIL_ON="critical,high"');
  });

  it('refuses to run against a CLI that cannot emit SARIF', async () => {
    // Regression: moshcoder/moshpit-name run 30803607991 installed the
    // published 0.2.2, which has no --format. The scan died with
    // `unknown option '--format'` and commander exited 1 — the same code the
    // CLI uses for "findings at or above --fail-on" — so the step read a
    // failure as a result and the PR comment said "0 findings". Green check,
    // nothing scanned. Exit codes cannot separate those two cases, so the
    // interface is checked up front and the SARIF file is treated as the only
    // evidence a scan happened.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    const content = result.files[0]?.content ?? '';
    expect(content).toContain('--format sarif --output threatcrush.sarif');
    expect(content).toContain('if [ ! -s threatcrush.sarif ]; then');
    // The capability probe and the converter it guarded are both gone. The
    // spec is pinned and the install refuses other bytes, so the interface is
    // decided by the pack rather than discovered on the runner.
    expect(content).not.toContain("grep -q -- '--format'");
    expect(content).not.toContain('.github/scripts/threatcrush-to-sarif.py');
    expect(content).toContain('this diff was NOT scanned');
    // And the report must be fail-closed. Testing for status == "error" was
    // fail-open: when the capability check fails the scan step is *skipped*,
    // so status is the empty string, and the comment reported "0 findings"
    // for a scan that never started.
    expect(content).toContain('if status not in ("clean", "findings")');
  });

  it('never uses pull_request_target', async () => {
    // That event runs with repository secrets in scope; combined with a
    // checkout of the PR head it executes untrusted contributor code with
    // access to them. Asserted rather than documented so it cannot regress.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: {},
    });
    // Comments are stripped first: the workflow documents why it stays on
    // `pull_request`, and a raw substring check would forbid explaining the
    // very decision it exists to protect. What matters is that no directive
    // selects the event.
    const directives = (result.files[0]?.content ?? '')
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    expect(directives).not.toContain('pull_request_target');
    expect(directives).toMatch(/^on:\n\s+pull_request:\s*$/m);
    expect(entry.manifest.security.allowPullRequestTarget).toBe(false);
  });

  it('omits the write scopes and the steps that need them, rather than disabling them', async () => {
    // The read-only install is the version a first-time reviewer is asked to
    // trust, so "least privilege" has to be a property of the rendered file
    // rather than of a condition inside it. A shipped-but-disabled Security
    // tab upload still asks a maintainer to read and reason about an upload.
    //
    // mac-developer-bridge declined the earlier shape on exactly this: the two
    // write scopes were requested unconditionally even though the workflow was
    // described as report-only, and GitHub downgrades them on fork pull
    // requests anyway — so the richest outputs were the least reliable ones
    // precisely where the scan is most useful.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');
    const result = await renderPack({
      packDir: entry.packDir,
      manifest: entry.manifest,
      inputs: { commentOnPr: 'false', uploadSarif: 'false' },
    });
    const content = result.files[0]?.content ?? '';
    const workflow = parseYaml(content);

    expect(workflow.permissions).toEqual({ contents: 'read' });

    const names = (workflow?.jobs?.scan?.steps ?? []).map((step: { name?: string }) => step?.name);
    expect(names).not.toContain('Upload to the Security tab');
    expect(names).not.toContain('Comment on PR');

    // Gone from the file, not merely unreachable in it. `upload-sarif` and
    // `github-script` are the two actions that would hold those scopes.
    expect(content).not.toContain('upload-sarif');
    expect(content).not.toContain('github-script');
    expect(content).not.toContain('security-events');
    expect(content).not.toContain('pull-requests: write');

    // The read-only outputs are the ones that survive, and they are also the
    // two that work on a fork pull request.
    expect(names).toContain('Build the report');
    expect(names).toContain('Upload SARIF artifact');
    expect(content).toContain('$GITHUB_STEP_SUMMARY');
  });

  it('still asks for a write scope only when the output that needs it is on', async () => {
    // Each scope is emitted by its own output, so the block cannot drift out
    // of step with what the workflow does. It used to be one hand-assembled
    // `extraPermissions` string, which made least privilege something a caller
    // had to remember.
    const catalog = await loadBuiltinPacks();
    const entry = catalog.get('threatcrush-scan');
    if (!entry) throw new Error('threatcrush-scan not in catalog');

    const permissionsFor = async (inputs: Record<string, string>) => {
      const result = await renderPack({ packDir: entry.packDir, manifest: entry.manifest, inputs });
      return parseYaml(result.files[0]?.content ?? '').permissions;
    };

    expect(await permissionsFor({ commentOnPr: 'true', uploadSarif: 'false' })).toEqual({
      contents: 'read',
      'pull-requests': 'write',
    });
    expect(await permissionsFor({ commentOnPr: 'false', uploadSarif: 'true' })).toEqual({
      contents: 'read',
      'security-events': 'write',
    });
  });
});
