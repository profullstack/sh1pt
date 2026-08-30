import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.fn();
const writeFileMock = vi.fn();
vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => accessMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}));

const promptsMock = vi.fn();
vi.mock('prompts', () => ({
  default: (...args: unknown[]) => promptsMock(...args),
}));

import { initAction, initCmd } from './init.js';

// Regression guard for `sh1pt init` on non-interactive stdin.
//
// `prompts` reads keystrokes from stdin. When stdin is not a TTY (CI, `< /dev/null`, a piped
// script with no bytes) it never receives input that resolves or cancels the prompt, and once
// nothing else is keeping the event loop alive Node exits on its own — abandoning the pending
// `await prompts(...)` without ever running the code after it. That used to make `sh1pt init`
// exit 0 without writing sh1pt.config.ts, so a script/CI step had no way to tell it had failed.
// `initAction` must now fail fast (non-zero exit code, no prompt call) instead of awaiting a
// prompt that can never settle, and `--name` must be able to skip the prompt entirely.
describe('initAction', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    accessMock.mockReset().mockRejectedValue(new Error('ENOENT'));
    writeFileMock.mockReset().mockResolvedValue(undefined);
    promptsMock.mockReset();
    originalIsTTY = process.stdin.isTTY;
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('fails with a non-zero exit code and never calls prompts() when stdin is not a TTY and no --name is given', async () => {
    process.stdin.isTTY = undefined;

    await initAction({});

    expect(promptsMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('writes the config straight from --name without prompting, even without a TTY', async () => {
    process.stdin.isTTY = undefined;

    await initAction({ name: 'coolapp' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const contents = writeFileMock.mock.calls[0][1] as string;
    expect(contents).toContain('name: "coolapp"');
    expect(process.exitCode).toBeUndefined();
  });

  it('still prompts interactively when stdin is a TTY and no --name is given', async () => {
    process.stdin.isTTY = true;
    promptsMock.mockResolvedValue({ name: 'from-prompt' });

    await initAction({});

    expect(promptsMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const contents = writeFileMock.mock.calls[0][1] as string;
    expect(contents).toContain('name: "from-prompt"');
    expect(process.exitCode).toBeUndefined();
  });

  it('fails with a non-zero exit code when the interactive prompt is cancelled', async () => {
    process.stdin.isTTY = true;
    promptsMock.mockResolvedValue({});

    await initAction({});

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('does not overwrite an existing sh1pt.config.ts, even with --name', async () => {
    accessMock.mockResolvedValue(undefined);

    await initAction({ name: 'ignored' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('wires --name through the commander option to initAction', async () => {
    process.stdin.isTTY = undefined;

    await initCmd.parseAsync(['--name', 'from-flag'], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const contents = writeFileMock.mock.calls[0][1] as string;
    expect(contents).toContain('name: "from-flag"');
  });
});
