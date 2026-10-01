import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

type LogFn = (msg: string, level?: 'info' | 'warn' | 'error') => void;

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command, optionally feeding `input` on stdin, streaming each output
 * line to `log`. core's exec() has no stdin, and the deploy script must travel
 * on stdin so the secrets inside it never show up in argv.
 */
export function run(cmd: string, args: string[], opts: { log: LogFn; input?: string; cwd?: string }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const lines = (level: 'info' | 'warn') => {
      let buf = '';
      return (chunk: Buffer) => {
        const text = chunk.toString();
        if (level === 'info') stdout += text; else stderr += text;
        buf += text;
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const line of parts) if (line.trim()) opts.log(line, level);
      };
    };
    child.stdout?.on('data', lines('info'));
    child.stderr?.on('data', lines('warn'));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    child.stdin?.end(opts.input ?? '');
  });
}

export function scriptText(name: 'install.sh' | 'deploy-remote.sh'): string {
  // ../bin from both src/ (workspace) and dist/ (published, "files" has bin).
  return readFileSync(new URL(`../bin/${name}`, import.meta.url), 'utf8');
}

/** Single-quote for a POSIX shell. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
