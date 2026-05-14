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

describe('secrets-onepassword CLI integration', () => {
  const config = { vault: 'Engineering', item: 'Production API' };
  const ctx = { secret: () => undefined, log: () => {} };

  it('pulls item fields as SecretRef values', async () => {
    const { binDir, logPath } = await installFakeOp({
      stdout: JSON.stringify({
        id: 'item-id',
        title: 'Production API',
        fields: [
          { id: 'username', label: 'API_USER', type: 'STRING', value: 'robot' },
          { id: 'password', label: 'API_KEY', type: 'CONCEALED', value: 'secret' },
          { id: 'notesPlain', label: 'notes', type: 'MENU', value: 'ignore-me' },
        ],
      }),
    });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    const secrets = await adapter.pull(ctx, config);

    expect(secrets).toEqual([
      { key: 'API_USER', value: 'robot', path: 'Production API', environment: 'Engineering' },
      { key: 'API_KEY', value: 'secret', path: 'Production API', environment: 'Engineering' },
    ]);
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['item', 'get', 'Production API', '--vault', 'Engineering', '--format', 'json'],
    }]);
  });

  it('pushes SecretRef values with op item edit', async () => {
    const { binDir, logPath } = await installFakeOp({ stdout: '{}' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    const result = await adapter.push(ctx, [
      { key: 'API_KEY', value: 'next' },
      { key: 'EMPTY_VALUE' },
    ], config);

    expect(result).toEqual({ count: 2 });
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['item', 'edit', 'Production API', '--vault', 'Engineering', 'API_KEY=next', 'EMPTY_VALUE='],
    }]);
  });

  it('checks the signed-in account during connect', async () => {
    const { binDir, logPath } = await installFakeOp({ stdout: '{"account_uuid":"acct"}' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    await expect(adapter.connect(ctx, config)).resolves.toEqual({ accountId: 'Engineering' });
    expect(await readJsonLines(logPath)).toEqual([{ args: ['whoami', '--format', 'json'] }]);
  });

  it('requires an item for pull and push operations', async () => {
    await expect(adapter.pull(ctx, { vault: 'Engineering' })).rejects.toThrow('secrets-onepassword requires config.item');
    await expect(adapter.push(ctx, [{ key: 'API_KEY', value: 'next' }], { vault: 'Engineering' })).rejects.toThrow('secrets-onepassword requires config.item');
  });
});

async function installFakeOp(opts: { stdout: string }): Promise<{ binDir: string; logPath: string }> {
  const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-op-bin-'));
  const logPath = join(binDir, 'op-log.jsonl');
  tempDirs.push(binDir);
  const script = join(binDir, 'op');
  await writeFile(script, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    `const logPath = ${JSON.stringify(logPath)};`,
    "fs.appendFileSync(logPath, JSON.stringify({ args: process.argv.slice(2) }) + '\\n');",
    `process.stdout.write(${JSON.stringify(opts.stdout)});`,
  ].join('\n'), 'utf-8');
  await chmod(script, 0o755);
  return { binDir, logPath };
}

async function readJsonLines(path: string): Promise<unknown[]> {
  return (await readFile(path, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
}
