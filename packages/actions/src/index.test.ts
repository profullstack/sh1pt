import { describe, it, expect } from 'vitest';
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
    // Workflow plus the legacy-output converter it falls back to.
    expect(entry?.manifest.files.map((f) => f.destination)).toEqual([
      '.github/workflows/threatcrush-scan.yml',
      '.github/scripts/threatcrush-to-sarif.py',
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
    expect(content).toContain("grep -q -- '--format'");
    expect(content).toContain('if [ ! -s threatcrush.sarif ]; then');
    // A CLI without --format takes the converter path rather than failing the
    // repo out of being scanned at all.
    expect(content).toContain('.github/scripts/threatcrush-to-sarif.py');
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
});
