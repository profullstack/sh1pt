import { defineTarget, manualSetup, exec } from '@profullstack/sh1pt-core';

// exe.dev is an SSH-based execution platform (ssh exe.dev).
// It lets you run commands, upload and download files over SSH/SFTP.
// Authentication uses SSH keys (ed25519 recommended).

type ExeOperation = 'run' | 'upload' | 'download' | 'status';

interface Config {
  /** The operation to execute */
  command?: ExeOperation;
  /** Remote shell command (for 'run') */
  remoteCommand?: string;
  /** Local file path (for 'upload' and 'download') */
  localPath?: string;
  /** Remote file path (for 'upload' and 'download') */
  remotePath?: string;
  /** exe.dev execution ID (for 'status') */
  executionId?: string;
  /** Additional arguments passed to the remote command */
  args?: string[];
  /** SSH host override (default: exe.dev) */
  host?: string;
  /** SSH port override (default: 22) */
  port?: number;
  /** SSH user override (default: current user via ~/.ssh) */
  user?: string;
}

const EXE_DEV_HOST = 'exe.dev';
const EXE_DEV_PORT = 22;

/**
 * Build an SSH command string from host, port, and user options.
 */
function sshArgs(user: string | undefined, host: string, port: number): string[] {
  const args: string[] = [];
  if (user) args.push('-o', `User=${user}`);
  if (port !== 22) args.push('-o', `Port=${port}`);
  args.push('-o', 'ConnectTimeout=10');
  args.push('-o', 'StrictHostKeyChecking=accept-new');
  args.push('-o', 'BatchMode=yes');
  return args;
}

export default defineTarget<Config>({
  id: 'exe-dev',
  kind: 'api',
  label: 'exe.dev (SSH execution platform)',

  async build(ctx, config) {
    const host = config.host ?? EXE_DEV_HOST;
    const port = config.port ?? EXE_DEV_PORT;
    const target = `${host}`;

    ctx.log(`exe.dev: checking SSH connectivity to ${target}`);

    // 1. Check that ssh is available locally
    await exec('ssh', ['-V'], { log: ctx.log, throwOnNonZero: false });

    // 2. Check that an SSH key exists
    try {
      const { stdout } = await exec('ssh-add', ['-l'], { log: () => {}, throwOnNonZero: false });
      if (!stdout.trim()) {
        ctx.log('exe.dev: no SSH keys loaded in ssh-agent — checking ~/.ssh for keys');
        await exec('ls', ['-la', `${process.env.HOME}/.ssh/id_ed25519.pub`], { log: ctx.log, throwOnNonZero: false });
      }
    } catch {
      ctx.log('exe.dev: ssh-agent unreachable, proceeding');
    }

    // 3. Verify connectivity to exe.dev via SSH (BatchMode — no password prompt)
    try {
      const probeArgs = [
        ...sshArgs(config.user, host, port),
        target,
        'echo', 'exe.dev:connected',
      ];
      const { stdout } = await exec('ssh', probeArgs, {
        log: ctx.log,
        throwOnNonZero: true,
      });

      if (!stdout.includes('exe.dev:connected')) {
        throw new Error('SSH connectivity probe returned unexpected output');
      }
      ctx.log('exe.dev: SSH connection verified ✓');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `exe.dev: cannot establish SSH connection to ${host}:${port}. ` +
        `Make sure your public SSH key is registered with exe.dev. ` +
        `Generate a key: ssh-keygen -t ed25519 -C "your@email.com", ` +
        `then register it at https://exe.dev. ` +
        `Error: ${msg}`
      );
    }

    // 4. Check for exe.dev token/secret (optional, for API features)
    const token = ctx.secret('EXE_DEV_TOKEN');
    if (token) {
      ctx.log('exe.dev: API token found in vault');
    } else {
      ctx.log('exe.dev: no API token set — SSH-only mode');
    }

    return { artifact: `ssh://${host}` };
  },

  async ship(ctx, config) {
    const cmd = config.command ?? 'run';
    const host = config.host ?? EXE_DEV_HOST;
    const port = config.port ?? EXE_DEV_PORT;
    const target = `${host}`;

    if (ctx.dryRun) {
      return { id: 'dry-run', meta: { command: cmd, host, port } };
    }

    switch (cmd) {
      case 'run': {
        // Execute a remote command on exe.dev
        const remoteCmd = config.remoteCommand;
        if (!remoteCmd) {
          throw new Error('remoteCommand is required for the "run" operation');
        }
        ctx.log(`exe.dev: executing remote command: ${remoteCmd}`);

        const sshOpts = [...sshArgs(config.user, host, port), target];

        // For simple commands, pass via ssh args. For complex ones, use a pipe.
        const allArgs = [...sshOpts, ...(config.args ?? []), remoteCmd];
        const { stdout, stderr } = await exec('ssh', allArgs, {
          log: ctx.log,
          throwOnNonZero: true,
        });

        const executionId = `run-${Date.now()}`;
        ctx.log(`exe.dev: command completed (id=${executionId})`);
        return {
          id: executionId,
          meta: {
            command: remoteCmd,
            host,
            port,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          },
        };
      }

      case 'upload': {
        // Upload a file to exe.dev via scp
        const localPath = config.localPath;
        const remotePath = config.remotePath;

        if (!localPath) throw new Error('localPath is required for the "upload" operation');
        if (!remotePath) throw new Error('remotePath is required for the "upload" operation');

        ctx.log(`exe.dev: uploading ${localPath} → ${target}:${remotePath}`);

        const scpArgs: string[] = [];
        if (port !== 22) scpArgs.push('-P', String(port));
        scpArgs.push('-o', 'ConnectTimeout=10');
        scpArgs.push('-o', 'StrictHostKeyChecking=accept-new');
        scpArgs.push('-o', 'BatchMode=yes');
        if (config.user) scpArgs.push('-o', `User=${config.user}`);
        scpArgs.push(localPath);
        scpArgs.push(`${target}:${remotePath}`);

        const { stdout, stderr } = await exec('scp', scpArgs, {
          log: ctx.log,
          throwOnNonZero: true,
        });

        const uploadId = `upload-${Date.now()}`;
        ctx.log(`exe.dev: upload complete (id=${uploadId})`);
        return {
          id: uploadId,
          meta: { localPath, remotePath, host, port, stdout: stdout.trim(), stderr: stderr.trim() },
        };
      }

      case 'download': {
        // Download a file from exe.dev via scp
        const localPath = config.localPath;
        const remotePath = config.remotePath;

        if (!remotePath) throw new Error('remotePath is required for the "download" operation');
        if (!localPath) throw new Error('localPath is required for the "download" operation');

        ctx.log(`exe.dev: downloading ${target}:${remotePath} → ${localPath}`);

        const scpArgs: string[] = [];
        if (port !== 22) scpArgs.push('-P', String(port));
        scpArgs.push('-o', 'ConnectTimeout=10');
        scpArgs.push('-o', 'StrictHostKeyChecking=accept-new');
        scpArgs.push('-o', 'BatchMode=yes');
        if (config.user) scpArgs.push('-o', `User=${config.user}`);
        scpArgs.push(`${target}:${remotePath}`);
        scpArgs.push(localPath);

        const { stdout, stderr } = await exec('scp', scpArgs, {
          log: ctx.log,
          throwOnNonZero: true,
        });

        const downloadId = `download-${Date.now()}`;
        ctx.log(`exe.dev: download complete (id=${downloadId})`);
        return {
          id: downloadId,
          meta: { localPath, remotePath, host, port, stdout: stdout.trim(), stderr: stderr.trim() },
        };
      }

      case 'status': {
        // Check status of a previous execution (probe connectivity)
        const { executionId } = config;
        ctx.log(`exe.dev: checking execution status${executionId ? ` (id=${executionId})` : ''}`);

        // Ping the host to verify it's still reachable
        const probeArgs = [
          ...sshArgs(config.user, host, port),
          target,
          'echo', 'exe.dev:alive',
        ];

        const { stdout } = await exec('ssh', probeArgs, {
          log: ctx.log,
          throwOnNonZero: true,
        });

        const alive = stdout.includes('exe.dev:alive');
        ctx.log(`exe.dev: host ${alive ? 'is reachable' : 'unreachable'} ✓`);

        return {
          id: executionId ?? `status-${Date.now()}`,
          meta: {
            host,
            port,
            alive,
            checkedAt: new Date().toISOString(),
          },
        };
      }

      default:
        throw new Error(`Unknown exe.dev command: ${cmd}. Supported: run, upload, download, status`);
    }
  },

  setup: manualSetup({
    label: 'exe.dev (SSH execution platform)',
    vendorDocUrl: 'https://exe.dev',
    steps: [
      'Generate an SSH key if you don\'t have one: ssh-keygen -t ed25519 -C "your@email.com"',
      'Visit https://exe.dev and register your public SSH key: pbcopy < ~/.ssh/id_ed25519.pub',
      'Test connectivity: ssh exe.dev',
      'Optional — set an API token: sh1pt secret set EXE_DEV_TOKEN <token>',
    ],
  }),
});
