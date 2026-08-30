import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSecretFromLocal,
  hasLoosePosixPermissions,
  listSecretsLocal,
  loadLocalVaultSync,
  localVaultPath,
} from './local-vault.js';

const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
let tempDir: string | undefined;

describe('local vault', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (ORIGINAL_XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('ignores malformed non-string secret values when reading asynchronously', async () => {
    tempDir = join(tmpdir(), `sh1pt-vault-${Date.now()}`);
    process.env.XDG_CONFIG_HOME = tempDir;
    await mkdir(join(tempDir, 'sh1pt'), { recursive: true });
    await writeFile(localVaultPath(), JSON.stringify({
      version: 1,
      secrets: {
        TOKEN: 'secret',
        COUNT: 123,
        FLAGS: ['x'],
      },
    }));

    expect(await getSecretFromLocal('TOKEN')).toBe('secret');
    expect(await getSecretFromLocal('COUNT')).toBeUndefined();
    expect(await listSecretsLocal()).toEqual([{ key: 'TOKEN' }]);
  });

  it('checks loose mode bits only on POSIX platforms', () => {
    expect(hasLoosePosixPermissions(0o666, 'win32')).toBe(false);
    expect(hasLoosePosixPermissions(0o666, 'linux')).toBe(true);
    expect(hasLoosePosixPermissions(0o600, 'linux')).toBe(false);
  });

  it.runIf(process.platform === 'win32')('does not suggest POSIX chmod permissions on Windows', async () => {
    tempDir = join(tmpdir(), `sh1pt-vault-${Date.now()}`);
    process.env.XDG_CONFIG_HOME = tempDir;
    await mkdir(join(tempDir, 'sh1pt'), { recursive: true });
    await writeFile(localVaultPath(), JSON.stringify({
      version: 1,
      secrets: { TOKEN: 'secret' },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(loadLocalVaultSync().get('TOKEN')).toBe('secret');
    expect(warn).not.toHaveBeenCalled();
  });
});
