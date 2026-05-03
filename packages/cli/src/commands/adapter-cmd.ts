// Factory: turn one AdapterCategory into a commander command tree that
// mirrors the filesystem, e.g.
//
//   packages/bots/discord         → sh1pt bots discord setup
//   packages/social/x             → sh1pt social x setup
//   packages/webhooks/slack       → sh1pt webhooks slack setup
//
// Every adapter gets `setup` + `info` subcommands. `setup` lazy-imports
// @profullstack/sh1pt-<prefix>-<name> and hands the default export to
// runSetup(). `info` prints what the CLI knows without loading the package.
//
// Adapters are optionalDependencies of the CLI — missing packages print
// an "npm i ..." hint instead of crashing.

import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  runSetup,
  type SetupContext,
  type SetupPromptDef,
  type AdapterWithSetup,
} from '@profullstack/sh1pt-core';
import type { AdapterCategory } from '../adapter-registry.js';
import { packageFor } from '../adapter-registry.js';
import { ensureInstalled, loadInstalledPackage } from '../installer.js';

export function makeCategoryCmd(category: AdapterCategory): Command {
  const cmd = new Command(category.id).description(category.description);

  cmd
    .command('list')
    .description(`List all ${category.id} adapters`)
    .action(() => {
      for (const name of category.adapters) {
        console.log(`  ${kleur.cyan(name)}  ${kleur.dim(packageFor(category, name))}`);
      }
    });

  // Register one subcommand per adapter: `sh1pt <cat> <name> setup|info`.
  for (const name of category.adapters) {
    const adapterCmd = cmd.command(name).description(`${category.id}/${name} adapter`);

    adapterCmd
      .command('setup')
      .description(`Run setup for ${category.id}/${name} (writes to ~/.config/sh1pt/config.json)`)
      .action(async () => {
        const pkgName = packageFor(category, name);
        try {
          await ensureInstalled([pkgName]);
        } catch (err) {
          console.error(kleur.red(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
        const adapter = await loadInstalledPackage<AdapterWithSetup>(pkgName);
        if (!adapter || typeof adapter !== 'object' || !('id' in adapter)) {
          console.log(kleur.yellow(`failed to load ${pkgName} after install — file an issue.`));
          return;
        }
        await runSetup(adapter, makeCliSetupContext());
      });

    adapterCmd
      .command('info')
      .description(`Show what the CLI knows about ${category.id}/${name}`)
      .action(() => {
        console.log(`${kleur.bold(`${category.id}/${name}`)}`);
        console.log(`  package: ${packageFor(category, name)}`);
        console.log(`  setup:   sh1pt ${category.id} ${name} setup`);
      });
  }

  return cmd;
}

// Single SetupContext implementation used by every adapter category.
// Secrets are stubbed (logged, kept in-process) until `sh1pt login` wires
// a real vault — the config side (./config.json) is live.
function makeCliSetupContext(): SetupContext {
  const memSecrets = new Map<string, string>();
  return {
    secret: (key) => process.env[key] ?? memSecrets.get(key),
    async setSecret(key, value) {
      memSecrets.set(key, value);
      process.env[key] = value;
      console.log(kleur.dim(`  [vault-stub] would persist ${key}=*** (vault not wired yet)`));
    },
    log: (m) => console.log(m),
    async prompt<T>(def: SetupPromptDef<T>): Promise<T> {
      const promptType =
        def.type === 'confirm' ? 'confirm' :
        def.type === 'select' ? 'select' :
        def.type === 'password' ? 'password' :
        'text';
      const res = await prompts({
        type: promptType as 'text' | 'password' | 'confirm' | 'select',
        name: 'v',
        message: def.message,
        initial: def.initial as unknown as string | number | boolean,
        choices: def.choices?.map((c) => ({ title: c.title, value: c.value })) as prompts.Choice[] | undefined,
        validate: def.validate ? (v: unknown) => {
          const r = def.validate!(v as T);
          return r === true ? true : r;
        } : undefined,
      });
      return res.v as T;
    },
    async open(url) {
      console.log(kleur.dim(`  → ${url}`));
    },
  };
}
