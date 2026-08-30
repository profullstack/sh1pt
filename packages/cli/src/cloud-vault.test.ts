import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const promptsMock = vi.fn();
vi.mock('prompts', () => ({
  default: (...args: unknown[]) => promptsMock(...args),
}));

import { resolveVaultPassphrase } from './cloud-vault.js';

// Regression guard for cloud-vault passphrase handling on non-interactive stdin.
//
// `prompts` reads keystrokes from stdin. When stdin is not a TTY (CI, `< /dev/null`,
// a piped script) it never receives input that resolves or cancels the prompt, and
// once nothing else is keeping the event loop alive Node exits on its own — abandoning
// the still-pending `await prompts(...)` before the "no passphrase entered" guard (added
// for the cancelled-prompt case) ever runs. That left non-interactive cloud-vault access
// (encrypt on `secret set --cloud`, decrypt on `secret get --cloud`) hanging indefinitely
// instead of failing with a message. `resolveVaultPassphrase` must now fail fast without a
// TTY, and `SH1PT_VAULT_PASSPHRASE` must be able to skip the prompt entirely.
describe('resolveVaultPassphrase', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    promptsMock.mockReset();
    originalIsTTY = process.stdin.isTTY;
    delete process.env.SH1PT_VAULT_PASSPHRASE;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    delete process.env.SH1PT_VAULT_PASSPHRASE;
    vi.restoreAllMocks();
  });

  it('throws instead of hanging when stdin is not a TTY and SH1PT_VAULT_PASSPHRASE is unset', async () => {
    process.stdin.isTTY = undefined;

    await expect(resolveVaultPassphrase(false)).rejects.toThrow(/no TTY/i);
    expect(promptsMock).not.toHaveBeenCalled();
  });

  it('returns SH1PT_VAULT_PASSPHRASE without prompting, even without a TTY', async () => {
    process.stdin.isTTY = undefined;
    process.env.SH1PT_VAULT_PASSPHRASE = 'correct horse battery staple';

    const passphrase = await resolveVaultPassphrase(false);

    expect(passphrase).toBe('correct horse battery staple');
    expect(promptsMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short SH1PT_VAULT_PASSPHRASE the same way the interactive prompt validation would', async () => {
    process.stdin.isTTY = undefined;
    process.env.SH1PT_VAULT_PASSPHRASE = 'short';

    await expect(resolveVaultPassphrase(false)).rejects.toThrow(/at least 8 characters/i);
  });

  it('still prompts interactively when stdin is a TTY and no env passphrase is set', async () => {
    process.stdin.isTTY = true;
    promptsMock.mockResolvedValue({ p: 'correct horse battery staple' });

    const passphrase = await resolveVaultPassphrase(true);

    expect(promptsMock).toHaveBeenCalledTimes(1);
    expect(passphrase).toBe('correct horse battery staple');
  });

  it('throws when the interactive prompt is cancelled', async () => {
    process.stdin.isTTY = true;
    promptsMock.mockResolvedValue({});

    await expect(resolveVaultPassphrase(true)).rejects.toThrow(/no passphrase entered/i);
  });
});
