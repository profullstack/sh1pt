import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { runShellCommand } from './run-shell.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('runShellCommand', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  it('returns the process exit status', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 3, error: undefined } as never);

    expect(runShellCommand(['pnpm', 'remove', '-g', '@profullstack/sh1pt'])).toBe(3);
  });

  it('fails when the executable cannot be spawned', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: null, error: new Error('not found') } as never);

    expect(runShellCommand(['missing-sh1pt-command-for-test'])).toBe(1);
  });

  it('fails when spawnSync reports a null status without an error', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: null, error: undefined } as never);

    expect(runShellCommand(['missing-sh1pt-command-for-test'])).toBe(1);
  });
});
