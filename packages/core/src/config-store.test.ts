import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configPath, deleteAdapterConfig, readConfig, setAdapterConfig, writeConfig } from './config-store.js';

const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
let tempDir: string | undefined;

describe('readConfig', () => {
  afterEach(async () => {
    if (ORIGINAL_XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('ignores malformed adapters arrays', async () => {
    tempDir = path.join(tmpdir(), `sh1pt-config-${Date.now()}`);
    process.env.XDG_CONFIG_HOME = tempDir;
    await mkdir(path.dirname(configPath()), { recursive: true });
    await writeFile(configPath(), JSON.stringify({
      version: 1,
      adapters: [{ id: 'target' }],
    }));

    await expect(readConfig()).resolves.toEqual({
      version: 1,
      adapters: {},
    });
  });

  it('preserves concurrent adapter configuration mutations', async () => {
    tempDir = path.join(tmpdir(), `sh1pt-config-${Date.now()}`);
    process.env.XDG_CONFIG_HOME = tempDir;

    await Promise.all([
      writeConfig({
        version: 1,
        adapters: { base: { enabled: true } },
      }),
      setAdapterConfig('target-a', { region: 'us-east' }),
      setAdapterConfig('target-b', { region: 'eu-west' }),
      setAdapterConfig('target-c', { region: 'ap-south' }),
    ]);

    await Promise.all([
      deleteAdapterConfig('target-b'),
      setAdapterConfig('target-d', { region: 'us-west' }),
    ]);

    await expect(readConfig()).resolves.toEqual({
      version: 1,
      adapters: {
        base: { enabled: true },
        'target-a': { region: 'us-east' },
        'target-c': { region: 'ap-south' },
        'target-d': { region: 'us-west' },
      },
    });
  });
});
