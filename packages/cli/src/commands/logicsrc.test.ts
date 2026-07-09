import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logicsrcCmd } from './logicsrc.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: '',
    stderr: '',
    pid: 123,
    output: [],
    signal: null,
  })),
}));

describe('logicsrc command', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockClear();
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes OpenSpec flags through the LogicSRC environment', () => {
    logicsrcCmd.parse(['--openspec', '--openspec-only', 'agentswarm', '--yolo'], { from: 'user' });

    expect(spawnSync).toHaveBeenCalledWith('logicsrc', ['agentswarm', '--yolo'], expect.objectContaining({
      stdio: 'inherit',
      env: expect.objectContaining({
        LOGICSRC_OPENSPEC_COMPAT: '1',
        LOGICSRC_OPENSPEC_ONLY: '1',
      }),
    }));
    expect(process.exitCode).toBe(0);
  });
});
