import { spawnSync } from 'node:child_process';

export function runCommand(argv: string[], env?: Record<string, string>): number {
  const [command, ...args] = argv;
  if (!command) throw new Error('empty command');

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}
