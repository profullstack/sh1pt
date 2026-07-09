// Self-management: sh1pt update / upgrade / remove / uninstall.
//
// Detects how sh1pt was installed by inspecting its own install path,
// then shells out to the same package manager to update or remove.
// No hard-coded paths — works whether you `npm i -g`, `pnpm add -g`,
// `bun install -g`, `aube add -g`, or `deno install`.

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import kleur from 'kleur';
import prompts from 'prompts';
import { detectPackageManager } from '../installer.js';

const PKG = '@profullstack/sh1pt';

function run(argv: string[]): number {
  console.log(kleur.cyan(`→ ${argv.join(' ')}`));
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error('empty command');
  const r = spawnSync(cmd, rest, { stdio: 'inherit' });
  return r.status ?? 0;
}

export const updateCmd = new Command('update')
  .alias('upgrade')
  .description('Update sh1pt to the latest release')
  .action(() => {
    const pm = detectPackageManager();
    // Most PMs cache the @latest tag aggressively. Bun in particular
    // returns instantly with a stale tag (the [4ms] "install" path),
    // which silently keeps users on the old version. Force-bypass the
    // cache so update actually checks the registry every time.
    const argv = (() => {
      switch (pm) {
        case 'pnpm': return ['pnpm', 'add', '-g', '--prefer-online', `${PKG}@latest`];
        case 'bun':  return ['bun',  'add', '-g', '--force',         `${PKG}@latest`];
        case 'aube': return ['aube', 'add', '-g', '--force',         `${PKG}@latest`];
        case 'deno': return ['deno', 'install', '-g', '-A', '-f', '-n', 'sh1pt', `npm:${PKG}`];
        case 'npm':  return ['npm',  'install', '-g', '--prefer-online', `${PKG}@latest`];
      }
    })();
    process.exit(run(argv));
  });

export const removeCmd = new Command('remove')
  .alias('uninstall')
  .description('Uninstall sh1pt (optionally nukes ~/.config/sh1pt)')
  .option('--keep-config', 'keep ~/.config/sh1pt/ (config + vault)', false)
  .action(async (opts: { keepConfig: boolean }) => {
    const pm = detectPackageManager();
    const argv = (() => {
      switch (pm) {
        case 'pnpm': return ['pnpm', 'remove', '-g', PKG];
        case 'bun':  return ['bun', 'remove', '-g', PKG];
        case 'aube': return ['aube', 'remove', '-g', PKG];
        case 'deno': return ['deno', 'uninstall', '-g', 'sh1pt'];
        case 'npm':  return ['npm', 'uninstall', '-g', PKG];
      }
    })();

    let deleteConfig = false;
    if (!opts.keepConfig) {
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Also delete ~/.config/sh1pt/ (adapter configs + stored secrets)?',
        initial: false,
      });
      deleteConfig = Boolean(confirm);
    }

    const code = run(argv);
    if (code === 0 && deleteConfig) {
      const xdg = process.env.XDG_CONFIG_HOME;
      const dir = xdg && xdg.length > 0
        ? `${xdg}/sh1pt`
        : `${process.env.HOME}/.config/sh1pt`;
      try {
        await fs.rm(dir, { recursive: true, force: true });
        console.log(kleur.dim(`removed ${dir}`));
      } catch (err) {
        console.warn(kleur.yellow(`could not remove ${dir}: ${(err as Error).message}`));
      }
    } else if (code === 0 && opts.keepConfig) {
      console.log(kleur.dim('config kept at ~/.config/sh1pt/'));
    }
    process.exit(code);
  });
