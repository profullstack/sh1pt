import { describe, it, expect } from 'vitest';
import {
  availableTargetAdapters,
  removeTargetFromConfig,
  rollbackTargets,
  setupTargets,
  shipCmd,
  statusTargets,
  upsertTargetInConfig,
} from './ship.js';

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

  it('builds setup checklist rows from configured targets', () => {
    const rows = setupTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'deploy-vercel': { use: 'target-deploy-vercel', config: {} },
        'pkg-npm': { use: 'target-pkg-npm', enabled: false, config: {} },
      },
    });

    expect(rows).toEqual([
      {
        id: 'deploy-vercel',
        use: 'target-deploy-vercel',
        enabled: true,
        package: '@profullstack/sh1pt-target-deploy-vercel',
        setupCommand: 'sh1pt targets deploy-vercel setup',
      },
      {
        id: 'pkg-npm',
        use: 'target-pkg-npm',
        enabled: false,
        package: '@profullstack/sh1pt-target-pkg-npm',
        setupCommand: 'sh1pt targets pkg-npm setup',
      },
    ]);
  });

  it('filters setup checklist rows by store ids', () => {
    const rows = setupTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'deploy-vercel': { use: 'target-deploy-vercel', config: {} },
        'pkg-npm': { use: 'target-pkg-npm', config: {} },
      },
    }, ['pkg-npm']);

    expect(rows).toEqual([
      {
        id: 'pkg-npm',
        use: 'target-pkg-npm',
        enabled: true,
        package: '@profullstack/sh1pt-target-pkg-npm',
        setupCommand: 'sh1pt targets pkg-npm setup',
      },
    ]);
  });

  it('supports JSON output for setup', () => {
    const setupCmd = shipCmd.commands.find((c) => c.name() === 'setup');
    expect(setupCmd).toBeDefined();
    expect(setupCmd!.options.map((o) => o.long)).toContain('--json');
  });

  it('builds ship status rows from configured targets', () => {
    const rows = statusTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'pkg-npm': { use: 'target-pkg-npm', config: {} },
        'deploy-vercel': { use: 'target-deploy-vercel', enabled: false, config: {} },
      },
    });

    expect(rows).toEqual([
      {
        id: 'pkg-npm',
        use: 'target-pkg-npm',
        enabled: true,
        status: 'configured',
      },
      {
        id: 'deploy-vercel',
        use: 'target-deploy-vercel',
        enabled: false,
        status: 'disabled',
      },
    ]);
  });

  it('filters ship status rows by target id', () => {
    const rows = statusTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'pkg-npm': { use: 'target-pkg-npm', config: {} },
        'deploy-vercel': { use: 'target-deploy-vercel', config: {} },
      },
    }, 'deploy-vercel');

    expect(rows).toEqual([
      {
        id: 'deploy-vercel',
        use: 'target-deploy-vercel',
        enabled: true,
        status: 'configured',
      },
    ]);
  });

  it('builds rollback plan rows from enabled configured targets', () => {
    const rows = rollbackTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'pkg-npm': { use: 'target-pkg-npm', config: {} },
        'deploy-vercel': { use: 'target-deploy-vercel', enabled: false, config: {} },
      },
    });

    expect(rows).toEqual([
      {
        id: 'pkg-npm',
        use: 'target-pkg-npm',
        action: 'rollback-latest',
      },
    ]);
  });

  it('filters rollback plan rows by target ids', () => {
    const rows = rollbackTargets({
      name: 'demo',
      version: '1.2.3',
      channels: [],
      targets: {
        'pkg-npm': { use: 'target-pkg-npm', config: {} },
        'deploy-vercel': { use: 'target-deploy-vercel', config: {} },
      },
    }, ['deploy-vercel']);

    expect(rows).toEqual([
      {
        id: 'deploy-vercel',
        use: 'target-deploy-vercel',
        action: 'rollback-latest',
      },
    ]);
  });

  it('supports JSON output for rollback', () => {
    const rollbackCmd = shipCmd.commands.find((c) => c.name() === 'rollback');
    expect(rollbackCmd).toBeDefined();
    expect(rollbackCmd!.options.map((o) => o.long)).toContain('--json');
  });

  it('adds a target to the init template targets block', () => {
    const source = [
      "import { defineConfig } from '@profullstack/sh1pt-core';",
      '',
      'export default defineConfig({',
      "  name: 'demo',",
      "  version: '0.0.0',",
      '  targets: {',
      '    // add targets with `sh1pt ship target add <id>`',
      '  },',
      '});',
      '',
    ].join('\n');

    const next = upsertTargetInConfig(source, 'pkg-npm');

    expect(next).toContain('"pkg-npm": { use: "target-pkg-npm", config: {} },');
    expect(next).toContain("version: '0.0.0'");
  });

  it('updates an existing target without duplicating it', () => {
    const source = [
      'export default defineConfig({',
      '  targets: {',
      '    "pkg-npm": { use: "target-pkg-npm", enabled: false, config: {} },',
      '  },',
      '});',
    ].join('\n');

    const next = upsertTargetInConfig(source, 'pkg-npm');

    expect(next.match(/"pkg-npm"/g)).toHaveLength(1);
    expect(next).not.toContain('enabled: false');
  });

  it('can add a disabled target', () => {
    const source = 'export default defineConfig({ targets: {} });';

    const next = upsertTargetInConfig(source, 'deploy-vercel', { enabled: false });

    expect(next).toContain('"deploy-vercel": { use: "target-deploy-vercel", enabled: false, config: {} },');
  });

  it('removes a target from config text', () => {
    const source = [
      'export default defineConfig({',
      '  targets: {',
      '    "pkg-npm": { use: "target-pkg-npm", config: {} },',
      '    "deploy-vercel": { use: "target-deploy-vercel", config: {} },',
      '  },',
      '});',
    ].join('\n');

    const next = removeTargetFromConfig(source, 'pkg-npm');

    expect(next).not.toContain('"pkg-npm"');
    expect(next).toContain('"deploy-vercel"');
  });
});
