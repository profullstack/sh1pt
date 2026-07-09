import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureCli, exec } from './exec.js';

const tempDirs: string[] = [];
const oldPath = process.env.PATH;
const itOnWindows = process.platform === 'win32' ? it : it.skip;
const itOnNonWindows = process.platform === 'win32' ? it.skip : it;

afterEach(async () => {
  process.env.PATH = oldPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('exec', () => {
  it('preserves percent-wrapped arguments on Windows shell execution', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-exec-bin-'));
    tempDirs.push(binDir);
    await installEchoArgsCli(binDir, 'sh1pt-echo-args');
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;

    const result = await exec('sh1pt-echo-args', [
      '%SH1PT_EXEC_LITERAL%',
      'C:\\tmp\\path\\',
      'Foo & Bar',
      'hello!world',
      'quoted "value"',
    ], {
      env: { SH1PT_EXEC_LITERAL: 'expanded-value' },
      log: () => {},
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual([
      '%SH1PT_EXEC_LITERAL%',
      'C:\\tmp\\path\\',
      'Foo & Bar',
      'hello!world',
      'quoted "value"',
    ]);
  });
});

describe('ensureCli', () => {
  itOnWindows('throws when Windows reports a command-not-found exit', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-exec-bin-'));
    tempDirs.push(binDir);
    await installFailingCli(binDir, 'sh1pt-missing-version');
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;

    await expect(ensureCli('sh1pt-missing-version', 'install it', () => {}))
      .rejects.toThrow('sh1pt-missing-version not installed. install it');
  });

  itOnNonWindows('keeps non-Windows non-zero version exits distinct from missing commands', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-exec-bin-'));
    tempDirs.push(binDir);
    await installFailingCli(binDir, 'sh1pt-installed-failing-version');
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;

    await expect(ensureCli('sh1pt-installed-failing-version', 'install it', () => {}))
      .resolves.toBeUndefined();
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

async function installEchoArgsCli(binDir: string, name: string): Promise<void> {
  const helper = join(binDir, 'echo-args.js');
  await writeFile(helper, 'console.log(JSON.stringify(process.argv.slice(2)));\n', 'utf-8');

  if (process.platform === 'win32') {
    await writeFile(
      join(binDir, `${name}.cmd`),
      `@echo off\r\n"${process.execPath}" "%~dp0echo-args.js" %*\r\n`,
      'utf-8',
    );
    return;
  }

  const script = join(binDir, name);
  await writeFile(script, `#!/usr/bin/env sh\n"${process.execPath}" "${helper}" "$@"\n`, {
    encoding: 'utf-8',
    mode: 0o755,
  });
}
