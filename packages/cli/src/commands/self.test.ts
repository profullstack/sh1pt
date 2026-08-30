import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const promptsMock = vi.fn();
vi.mock('prompts', () => ({
  default: (...args: unknown[]) => promptsMock(...args),
}));

const detectPackageManagerMock = vi.fn(() => 'npm' as const);
vi.mock('../installer.js', () => ({
  detectPackageManager: () => detectPackageManagerMock(),
}));

const runCommandMock = vi.fn(() => 0);
vi.mock('../run-command.js', () => ({
  runCommand: (...args: unknown[]) => runCommandMock(...args),
}));

const rmMock = vi.fn(async () => undefined);
vi.mock('node:fs', () => ({
  promises: { rm: (...args: unknown[]) => rmMock(...args) },
}));

vi.mock('@profullstack/sh1pt-core', () => ({
  configDir: () => '/fake/home/.config/sh1pt',
}));

import { removeCmd } from './self.js';

// Regression guard for `sh1pt remove` (uninstall) on non-interactive stdin.
//
// The "also delete ~/.config/sh1pt/?" prompt used to run *before* the actual
// `run(argv)` uninstall call. `prompts()` reads keystrokes from stdin; when stdin
// is not a TTY (CI, `< /dev/null`, a piped uninstall script) it never receives
// input that resolves or cancels the prompt, and once nothing else is keeping
// the event loop alive Node exits on its own — abandoning the pending prompt
// *before* `run(argv)` ever executes. `sh1pt remove` therefore used to silently
// uninstall nothing at all in a non-interactive shell, while still exiting 0.
describe('removeCmd (sh1pt remove/uninstall)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    promptsMock.mockReset();
    detectPackageManagerMock.mockReset().mockReturnValue('npm');
    runCommandMock.mockReset().mockReturnValue(0);
    rmMock.mockReset().mockResolvedValue(undefined);
    originalIsTTY = process.stdin.isTTY;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    vi.restoreAllMocks();
  });

  it('still runs the actual uninstall command when stdin is not a TTY', async () => {
    process.stdin.isTTY = undefined;

    await removeCmd.parseAsync([], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(runCommandMock).toHaveBeenCalledWith(['npm', 'uninstall', '-g', '@profullstack/sh1pt']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('keeps ~/.config/sh1pt/ by default when it cannot ask (no TTY)', async () => {
    process.stdin.isTTY = undefined;

    await removeCmd.parseAsync([], { from: 'user' });

    expect(rmMock).not.toHaveBeenCalled();
  });

  it('still prompts and honors the answer when stdin is a TTY', async () => {
    process.stdin.isTTY = true;
    promptsMock.mockResolvedValue({ confirm: true });

    await removeCmd.parseAsync([], { from: 'user' });

    expect(promptsMock).toHaveBeenCalledTimes(1);
    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalledWith('/fake/home/.config/sh1pt', { recursive: true, force: true });
  });

  it('skips the prompt entirely when --keep-config is passed, TTY or not', async () => {
    process.stdin.isTTY = undefined;

    await removeCmd.parseAsync(['--keep-config'], { from: 'user' });

    expect(promptsMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(rmMock).not.toHaveBeenCalled();
  });
});
