import { spawnSync } from 'node:child_process';

export function runShellCommand(argv: string[], env?: Record<string, string>): number {
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error('empty command');

  const result = spawnSync(cmd, rest, {
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });

  // Node reports a spawn failure with an error and a null status. Neither is success.
  return result.error || result.status === null ? 1 : result.status;
}
