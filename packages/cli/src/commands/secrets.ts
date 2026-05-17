import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  deleteSecretFromCloud,
  getSecretFromCloud,
  isSignedIn,
  listSecretsFromCloud,
  setSecretInCloud,
} from '../cloud-vault.js';
import {
  deleteSecretFromLocal,
  getSecretFromLocal,
  listSecretsLocal,
  localVaultPath,
  setSecretInLocal,
} from '../local-vault.js';

// Two storage layers, one command:
//   - local: ~/.config/sh1pt/secrets.json (mode 0600). Always available.
//   - cloud: encrypted via libsodium, syncs across machines. Requires login.
//
// Default behaviour mirrors SetupContext — write to local always, also
// push to cloud when signed in. Reads prefer local; fall back to cloud.
// Use --local / --cloud to scope operations to one layer.

interface ScopeOpts {
  local?: boolean;
  cloud?: boolean;
}

export const secretsCmd = new Command('secret')
  .description('Manage credentials in the local + cloud vaults');

secretsCmd
  .command('set <key> [value]')
  .description('Set a secret (value prompted if omitted; never echoed)')
  .option('--local', 'write only to the local vault')
  .option('--cloud', 'write only to the cloud vault')
  .action(async (key: string, value: string | undefined, opts: ScopeOpts) => {
    let v = value;
    if (!v) {
      const res = await prompts({ type: 'password', name: 'v', message: `Value for ${key}:` });
      v = res.v as string | undefined;
    }
    if (!v) {
      console.log(kleur.dim('aborted — no value entered.'));
      return;
    }

    const writeLocal = !opts.cloud;
    const writeCloud = opts.cloud || (!opts.local && (await isSignedIn()));

    if (writeLocal) {
      try {
        await setSecretInLocal(key, v);
        console.log(kleur.green(`✓ ${key} → ${localVaultPath()}`));
      } catch (err) {
        console.error(kleur.red(`local: ${err instanceof Error ? err.message : String(err)}`));
        if (!writeCloud) process.exit(1);
      }
    }
    if (writeCloud) {
      try {
        await setSecretInCloud(key, v);
        console.log(kleur.green(`✓ ${key} encrypted → sh1pt.com vault`));
      } catch (err) {
        console.error(kleur.red(`cloud: ${err instanceof Error ? err.message : String(err)}`));
        if (!writeLocal) process.exit(1);
      }
    }
    if (!writeLocal && !writeCloud) {
      console.error(kleur.yellow('Not signed in and --cloud not given. Run `sh1pt login` or pass --local.'));
      process.exit(1);
    }
  });

secretsCmd
  .command('get <key>')
  .description('Print a secret (local first, then cloud)')
  .option('--local', 'read only from the local vault')
  .option('--cloud', 'read only from the cloud vault')
  .action(async (key: string, opts: ScopeOpts) => {
    if (!opts.cloud) {
      const local = await getSecretFromLocal(key);
      if (local !== undefined) {
        process.stdout.write(`${local}\n`);
        return;
      }
      if (opts.local) {
        console.error(kleur.yellow(`no local entry for ${key}`));
        process.exit(1);
      }
    }
    if (!(await isSignedIn())) {
      console.error(kleur.yellow(`no entry for ${key} (and not signed in for cloud lookup)`));
      process.exit(1);
    }
    try {
      const v = await getSecretFromCloud(key);
      if (v === undefined) {
        console.error(kleur.yellow(`no entry for ${key}`));
        process.exit(1);
      }
      process.stdout.write(`${v}\n`);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

secretsCmd
  .command('list')
  .description('List secret keys (never values)')
  .option('--local', 'list only the local vault')
  .option('--cloud', 'list only the cloud vault')
  .action(async (opts: ScopeOpts) => {
    const showLocal = !opts.cloud;
    const showCloud = opts.cloud || (!opts.local && (await isSignedIn()));

    if (showLocal) {
      const entries = await listSecretsLocal();
      console.log(kleur.bold(`local (${localVaultPath()})`));
      if (entries.length === 0) {
        console.log(kleur.dim('  (empty)'));
      } else {
        for (const e of entries) console.log(`  ${kleur.cyan(e.key)}`);
      }
    }
    if (showCloud) {
      if (showLocal) console.log();
      console.log(kleur.bold('cloud (sh1pt.com vault)'));
      const entries = await listSecretsFromCloud();
      if (entries.length === 0) {
        console.log(kleur.dim('  (empty)'));
      } else {
        for (const e of entries) console.log(`  ${kleur.cyan(e.key)}  ${kleur.dim(e.updated_at)}`);
      }
    }
  });

secretsCmd
  .command('rm <key>')
  .description('Delete a secret (both layers by default)')
  .option('--local', 'remove only from the local vault')
  .option('--cloud', 'remove only from the cloud vault')
  .action(async (key: string, opts: ScopeOpts) => {
    const removeLocal = !opts.cloud;
    const removeCloud = opts.cloud || (!opts.local && (await isSignedIn()));

    if (removeLocal) {
      const removed = await deleteSecretFromLocal(key);
      console.log(removed ? kleur.dim(`removed ${key} (local)`) : kleur.dim(`no local entry for ${key}`));
    }
    if (removeCloud) {
      try {
        await deleteSecretFromCloud(key);
        console.log(kleur.dim(`removed ${key} (cloud)`));
      } catch (err) {
        console.error(kleur.red(`cloud: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  });
