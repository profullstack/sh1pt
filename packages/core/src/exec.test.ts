import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureCli, exec } from './exec.js';

const tempDirs: string[] = [];
const oldPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = oldPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('exec', () => {
  it('preserves percent-wrapped arguments on Windows shell execution', async () => {
    const result = await exec(process.execPath, ['-e', 'console.log(process.argv[1])', '%SH1PT_EXEC_LITERAL%'], {
      log: () => {},
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('%SH1PT_EXEC_LITERAL%');
  });
});

describe('ensureCli', () => {
  it('throws when a command exits non-zero instead of reporting it as installed', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-exec-bin-'));
    tempDirs.push(binDir);
    await installFailingCli(binDir, 'sh1pt-missing-version');
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;

    await expect(ensureCli('sh1pt-missing-version', 'install it', () => {}))
      .rejects.toThrow('sh1pt-missing-version not installed. install it');
  });
});

async function installFailingCli(binDir: string, name: string): Promise<void> {
  if (process.platform === 'win32') {
    await writeFile(join(binDir, `${name}.cmd`), '@echo off\r\nexit /b 9009\r\n', 'utf-8');
    return;
  }

  const script = join(binDir, name);
  await writeFile(script, '#!/usr/bin/env sh\nexit 127\n', { encoding: 'utf-8', mode: 0o755 });
}
