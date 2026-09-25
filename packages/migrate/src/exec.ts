import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExecOptions, ExecResult } from './types.js';

/**
 * Running an external command.
 *
 * The real implementation behind the `exec` every engine receives. It is
 * injected rather than imported so the engines can be tested without any of
 * the tools installed, and so a dry run can be genuinely inert.
 *
 * `spawn` without a shell, always. Engines build argument arrays from
 * connection strings, bucket names and paths, all of which come from config a
 * person edits — running those through a shell would make a bucket named
 * `; rm -rf /` a working attack and a path with a space a silent bug. The
 * cost is that `>` and `<` do not work, which is why redirection is an option
 * rather than a character in the argument list.
 */
export function createExec(opts: { log?: (msg: string) => void } = {}) {
  return async function exec(
    cmd: string,
    args: string[],
    options: ExecOptions = {},
  ): Promise<ExecResult> {
    const { env, cwd, check = true, timeoutMs, stdoutFile, stdinFile } = options;

    if (stdoutFile) await mkdir(dirname(stdoutFile), { recursive: true });

    // Arguments are logged; the environment never is. That split is the whole
    // reason credentials are passed through env.
    opts.log?.(`$ ${cmd} ${args.join(' ')}`);

    return new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(cmd, args, {
        env: { ...process.env, ...env },
        ...(cwd ? { cwd } : {}),
        stdio: [stdinFile ? 'pipe' : 'ignore', stdoutFile ? 'pipe' : 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = timeoutMs
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`));
          }, timeoutMs)
        : undefined;

      if (stdoutFile && child.stdout) {
        const out = createWriteStream(stdoutFile);
        child.stdout.pipe(out);
      } else {
        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
      }

      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      if (stdinFile && child.stdin) {
        createReadStream(stdinFile).pipe(child.stdin);
      }

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        // ENOENT here means the binary is missing, which the planner is
        // supposed to have caught. Say which one, so the message is actionable
        // rather than "spawn ENOENT".
        const message =
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? `${cmd} is not installed or not on PATH`
            : err.message;
        reject(new Error(message));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const result: ExecResult = { code: code ?? 0, stdout, stderr };
        if (check && result.code !== 0) {
          reject(
            new Error(
              `${cmd} exited ${result.code}${stderr ? `: ${stderr.trim().split('\n').slice(-3).join('\n')}` : ''}`,
            ),
          );
          return;
        }
        resolve(result);
      });
    });
  };
}

/**
 * An exec that records instead of running, for `--dry-run`.
 *
 * A dry run has to be genuinely inert: the point is to be safe to run against
 * production, and an engine that shells out "just to look" is not.
 */
export function recordingExec(recorded: string[][] = []) {
  const exec = async (cmd: string, args: string[]): Promise<ExecResult> => {
    recorded.push([cmd, ...args]);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { exec, recorded };
}

/** Which of these binaries are on PATH, for the planner's preflight check. */
export async function availableBinaries(names: string[]): Promise<Set<string>> {
  const exec = createExec();
  const found = new Set<string>();
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await exec('sh', ['-c', `command -v ${JSON.stringify(name)}`], { check: false });
        if (res.code === 0 && res.stdout.trim()) found.add(name);
      } catch {
        // Missing is the answer, not an error.
      }
    }),
  );
  return found;
}
