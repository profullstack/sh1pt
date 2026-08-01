import { describe, expect, it } from 'vitest';
import { runCommand } from './run-command.js';

describe('runCommand', () => {
  it('returns a failure code when the executable cannot be started', () => {
    expect(runCommand(['missing-sh1pt-command-for-test'])).toBe(1);
  });

  it('returns the child process exit code', () => {
    expect(runCommand([process.execPath, '-e', 'process.exit(7)'])).toBe(7);
  });
});
