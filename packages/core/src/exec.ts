import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import type { BuildContext } from './target.js';

type LogFn = BuildContext['log'];

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  log: LogFn;
  throwOnNonZero?: boolean;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function exec(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  const throwOnNonZero = opts.throwOnNonZero ?? true;

  // Filter out undefined values so they don't shadow inherited process.env.
  const extraEnv: Record<string, string> = {};
  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      if (v !== undefined) extraEnv[k] = v;
    }
  }

  return new Promise<ExecResult>((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: opts.cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    const child = shouldUseWindowsShell(cmd)
      ? spawn(windowsCommandLine(cmd, args), { ...spawnOptions, shell: true })
      : spawn(cmd, args, spawnOptions);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split('\n')) if (line) opts.log(line);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split('\n')) if (line) opts.log(line, 'warn');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`command not found: ${cmd}`));
      } else {
        reject(err);
      }
    });

    child.on('close', (exitCode) => {
      const result: ExecResult = { exitCode: exitCode ?? -1, stdout, stderr };
      if (throwOnNonZero && result.exitCode !== 0) {
        const tail = stderr.trim().split('\n').pop() ?? stdout.trim().split('\n').pop() ?? '';
        reject(new Error(`${cmd} ${args.join(' ')} failed (exit ${result.exitCode}): ${tail}`));
      } else {
        resolve(result);
      }
    });
  });
}

function shouldUseWindowsShell(cmd: string): boolean {
  return process.platform === 'win32'
    && !cmd.includes('/')
    && !cmd.includes('\\')
    && !/\.(?:exe|com)$/i.test(cmd);
}

function windowsCommandLine(cmd: string, args: string[]): string {
  return [cmd, ...args].map(windowsShellQuote).join(' ');
}

function windowsShellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.+@-]+$/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, '$&$&')}"`;
}

export async function ensureCli(cmd: string, installHint: string, log: LogFn): Promise<void> {
  try {
    const result = await exec(cmd, ['--version'], { log: () => {}, throwOnNonZero: false });
    if (result.exitCode !== 0) throw new Error(`command not found: ${cmd}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('command not found')) {
      log(`${cmd} not found on PATH`, 'error');
      throw new Error(`${cmd} not installed. ${installHint}`);
    }
    throw err;
  }
}
