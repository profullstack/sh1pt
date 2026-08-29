import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../local-vault.js', () => ({
  deleteSecretFromLocal: vi.fn(),
  getSecretFromLocal: vi.fn(),
  listSecretsLocal: vi.fn(async () => [{ key: 'LOCAL_TOKEN' }]),
  localVaultPath: vi.fn(() => '/tmp/sh1pt/secrets.json'),
  setSecretInLocal: vi.fn(),
}));

vi.mock('../cloud-vault.js', () => ({
  deleteSecretFromCloud: vi.fn(),
  getSecretFromCloud: vi.fn(),
  isSignedIn: vi.fn(async () => false),
  listSecretsFromCloud: vi.fn(async () => [
    { key: 'CLOUD_TOKEN', updated_at: '2026-08-30T00:00:00Z' },
  ]),
  setSecretInCloud: vi.fn(),
}));

import { secretsCmd } from './secrets.js';

describe('secret list --json', () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits local keys without exposing values', async () => {
    const listCmd = secretsCmd.commands.find((command) => command.name() === 'list')!;
    await listCmd.parseAsync(['--local', '--json'], { from: 'user' });

    expect(JSON.parse(stdout.join('\n'))).toEqual({
      local: [{ key: 'LOCAL_TOKEN' }],
    });
  });

  it('emits cloud keys and timestamps as JSON', async () => {
    const listCmd = secretsCmd.commands.find((command) => command.name() === 'list')!;
    await listCmd.parseAsync(['--cloud', '--json'], { from: 'user' });

    expect(JSON.parse(stdout.join('\n'))).toEqual({
      cloud: [{ key: 'CLOUD_TOKEN', updated_at: '2026-08-30T00:00:00Z' }],
    });
  });
});
