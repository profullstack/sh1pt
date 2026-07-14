import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addTargetToConfig, availableTargetAdapters, loadManifest, removeTargetFromConfig, shipCmd } from './ship.js';

describe('shipCmd', () => {
  it('is registered as a top-level command named "ship"', () => {
    expect(shipCmd.name()).toBe('ship');
  });

  it('has the expected subcommands', () => {
    const subcommandNames = shipCmd.commands.map((c) => c.name());
    expect(subcommandNames).toContain('init');
    expect(subcommandNames).toContain('status');
    expect(subcommandNames).toContain('target');
    expect(subcommandNames).toContain('setup');
    expect(subcommandNames).toContain('rollback');
    expect(subcommandNames).toContain('lint');
    expect(subcommandNames).toContain('logs');
  });

  it('has target subcommand with expected sub-subcommands', () => {
    const targetCmd = shipCmd.commands.find((c) => c.name() === 'target');
    expect(targetCmd).toBeDefined();
    const targetSubNames = targetCmd!.commands.map((c) => c.name());
    expect(targetSubNames).toContain('add');
    expect(targetSubNames).toContain('remove');
    expect(targetSubNames).toContain('list');
    expect(targetSubNames).toContain('available');
  });

  it('supports --target and --channel options', () => {
    const optNames = shipCmd.options.map((o) => o.long);
    expect(optNames).toContain('--target');
    expect(optNames).toContain('--channel');
    expect(optNames).toContain('--dry-run');
    expect(optNames).toContain('--skip-lint');
  });

  it('lists available target adapters from the registry', () => {
    expect(availableTargetAdapters()).toContainEqual({
      id: 'deploy-vercel',
      package: '@profullstack/sh1pt-target-deploy-vercel',
      setupCommand: 'sh1pt targets deploy-vercel setup',
    });
  });

  it('supports JSON output for target available', () => {
    const targetCmd = shipCmd.commands.find((c) => c.name() === 'target');
    expect(targetCmd).toBeDefined();
    const availableCmd = targetCmd!.commands.find((c) => c.name() === 'available');
    expect(availableCmd).toBeDefined();
    expect(availableCmd!.options.map((o) => o.long)).toContain('--json');
  });

  it('reports broken config files instead of silently using an empty manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sh1pt-bad-config-'));
    const file = join(dir, 'sh1pt.config.mjs');
    await writeFile(file, 'throw new Error("boom");\nexport default {};\n');

    await expect(loadManifest(file)).rejects.toThrow(/cannot load config file .*boom/);
  });

  it('adds a target adapter to sh1pt.config.ts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sh1pt-target-add-'));
    const file = join(dir, 'sh1pt.config.ts');
    await writeFile(file, `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: 'demo',
  version: '0.0.0',
  targets: {
    // add targets with \`sh1pt ship target add <id>\`
  },
});
`);

    addTargetToConfig(file, 'deploy-vercel');

    const config = await readFile(file, 'utf8');
    expect(config).toContain('"deploy-vercel": { use: "deploy-vercel", config: {} },');
  });

  it('removes target entries that were added by the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sh1pt-target-remove-'));
    const file = join(dir, 'sh1pt.config.ts');
    await writeFile(file, `import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: 'demo',
  version: '0.0.0',
  targets: {
    "deploy-vercel": { use: "deploy-vercel", config: {} },
  },
});
`);

    removeTargetFromConfig(file, 'deploy-vercel');

    const config = await readFile(file, 'utf8');
    expect(config).not.toContain('deploy-vercel');
  });
});
