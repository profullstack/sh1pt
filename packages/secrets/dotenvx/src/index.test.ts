import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

const tempDirs: string[] = [];

async function tempEnvFile(contents = ''): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sh1pt-dotenvx-'));
  tempDirs.push(dir);
  const envFile = join(dir, '.env');
  await writeFile(envFile, contents, 'utf8');
  return envFile;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('dotenvx secret provider', () => {
  it('pulls values from env files with comments, export prefixes, and quotes', async () => {
    const envFile = await tempEnvFile([
      '# keep comments out of pull results',
      'export API_KEY=abc123',
      'QUOTED="hello world"',
      "SINGLE='single value'",
      'ESCAPED="line\\nnext"',
      'EMPTY=',
      '',
    ].join('\n'));

    await expect(adapter.pull({ secret: () => undefined, log: () => {} }, { envFile })).resolves.toEqual([
      { key: 'API_KEY', value: 'abc123', path: envFile },
      { key: 'QUOTED', value: 'hello world', path: envFile },
      { key: 'SINGLE', value: 'single value', path: envFile },
      { key: 'ESCAPED', value: 'line\nnext', path: envFile },
      { key: 'EMPTY', value: '', path: envFile },
    ]);
  });

  it('upserts pushed values while preserving unrelated lines', async () => {
    const envFile = await tempEnvFile([
      '# existing env',
      'EXISTING=old',
      'UNCHANGED=1',
      '',
    ].join('\n'));

    await expect(adapter.push({ secret: () => undefined, log: () => {} }, [
      { key: 'EXISTING', value: 'new value' },
      { key: 'ADDED', value: 'plain-value' },
      { key: 'MULTILINE', value: 'line\nnext' },
    ], { envFile })).resolves.toEqual({ count: 3 });

    await expect(readFile(envFile, 'utf8')).resolves.toBe([
      '# existing env',
      'EXISTING="new value"',
      'UNCHANGED=1',
      '',
      'ADDED=plain-value',
      'MULTILINE="line\\nnext"',
      '',
    ].join('\n'));
  });
});
