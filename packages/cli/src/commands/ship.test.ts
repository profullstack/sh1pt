import { describe, it, expect } from 'vitest';
import { shipCmd } from './ship.js';

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
});
