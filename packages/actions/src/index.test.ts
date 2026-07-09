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
});
