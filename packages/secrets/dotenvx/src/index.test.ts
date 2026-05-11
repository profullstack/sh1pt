import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('secrets-dotenvx env file storage', () => {
  it('pulls secrets from dotenv files with quoted and unquoted values', async () => {
    const dir = await tempDir();
    const envFile = join(dir, '.env');
    await writeFile(envFile, [
      '# comment',
      'API_KEY=plain-token',
      'export MULTILINE="line 1\\nline 2"',
      "SINGLE='literal value'",
      'WITH_COMMENT=value # keep comment out',
      '',
    ].join('\n'), 'utf8');

    await expect(adapter.pull(ctx(), { envFile })).resolves.toEqual([
      { key: 'API_KEY', value: 'plain-token', path: envFile },
      { key: 'MULTILINE', value: 'line 1\nline 2', path: envFile },
      { key: 'SINGLE', value: 'literal value', path: envFile },
      { key: 'WITH_COMMENT', value: 'value', path: envFile },
    ]);
  });

  it('updates existing keys and appends new quoted values', async () => {
    const dir = await tempDir();
    const envFile = join(dir, '.env');
    await writeFile(envFile, 'API_KEY=old\n# keep me\n', 'utf8');

    const result = await adapter.push(ctx(), [
      { key: 'API_KEY', value: 'new-token' },
      { key: 'GREETING', value: 'hello world' },
      { key: 'SKIP_ME' },
    ], { envFile });

    expect(result).toEqual({ count: 2 });
    await expect(readFile(envFile, 'utf8')).resolves.toBe('API_KEY=new-token\n# keep me\nGREETING="hello world"\n');
  });

  it('returns an empty list for missing env files', async () => {
    const dir = await tempDir();
    await expect(adapter.pull(ctx(), { envFile: join(dir, '.env.missing') })).resolves.toEqual([]);
  });
});

function ctx() {
  return {
    secret: () => undefined,
    log: () => {},
  };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sh1pt-dotenvx-'));
  tempDirs.push(dir);
  return dir;
}
