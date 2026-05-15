import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

const tempDirs: string[] = [];
const oldPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = oldPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('secrets-doppler CLI integration', () => {
  const config = { project: 'demo-app', config: 'prd' };
  const ctx = {
    secret: (key: string) => key === 'DOPPLER_TOKEN' ? 'dp.st.test' : undefined,
    log: () => {},
  };

  it('downloads Doppler secrets as SecretRef values', async () => {
    const { binDir, logPath } = await installFakeDoppler({
      stdout: JSON.stringify({
        API_KEY: { computed: 'live-key' },
        PLAIN_VALUE: 'plain',
      }),
    });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    const secrets = await adapter.pull(ctx, config);

    expect(secrets).toEqual([
      { key: 'API_KEY', value: 'live-key', environment: 'prd' },
      { key: 'PLAIN_VALUE', value: 'plain', environment: 'prd' },
    ]);
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['secrets', 'download', '--no-file', '--format', 'json', '--project', 'demo-app', '--config', 'prd'],
      token: 'dp.st.test',
      project: 'demo-app',
      config: 'prd',
    }]);
  });

  it('sets pushed secrets through the Doppler CLI', async () => {
    const { binDir, logPath } = await installFakeDoppler({ stdout: '{}' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    const result = await adapter.push(ctx, [
      { key: 'API_KEY', value: 'next-key' },
      { key: 'EMPTY_VALUE' },
    ], config);

    expect(result).toEqual({ count: 2 });
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['secrets', 'set', '--project', 'demo-app', '--config', 'prd', 'API_KEY=next-key', 'EMPTY_VALUE='],
      token: 'dp.st.test',
      project: 'demo-app',
      config: 'prd',
    }]);
  });

  it('checks the account with doppler me during connect', async () => {
    const { binDir, logPath } = await installFakeDoppler({ stdout: '{"name":"demo"}' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    await expect(adapter.connect(ctx, config)).resolves.toEqual({ accountId: 'demo-app' });
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['me', '--json'],
      token: 'dp.st.test',
      project: 'demo-app',
      config: 'prd',
    }]);
  });

  it('fails with a vault hint when the token is missing', async () => {
    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, config)).rejects.toThrow('DOPPLER_TOKEN not in vault');
  });
});

async function installFakeDoppler(opts: { stdout: string }): Promise<{ binDir: string; logPath: string }> {
  const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-doppler-bin-'));
  const logPath = join(binDir, 'doppler-log.jsonl');
  tempDirs.push(binDir);
  const script = join(binDir, 'doppler');
  await writeFile(script, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    `const logPath = ${JSON.stringify(logPath)};`,
    "fs.appendFileSync(logPath, JSON.stringify({ args: process.argv.slice(2), token: process.env.DOPPLER_TOKEN, project: process.env.DOPPLER_PROJECT, config: process.env.DOPPLER_CONFIG }) + '\\n');",
    `process.stdout.write(${JSON.stringify(opts.stdout)});`,
  ].join('\n'), 'utf-8');
  await chmod(script, 0o755);
  return { binDir, logPath };
}

async function readJsonLines(path: string): Promise<unknown[]> {
  return (await readFile(path, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
}
