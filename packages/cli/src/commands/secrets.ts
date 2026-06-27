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

// ---------------------------------------------------------------------------
// Environment updater — sync secrets across providers
// ---------------------------------------------------------------------------

// Provider slug → adapter package mapping for lazy install.
const PROVIDER_PACKAGES: Record<string, string> = {
  dotenvx: '@profullstack/sh1pt-secrets-dotenvx',
  doppler: '@profullstack/sh1pt-secrets-doppler',
  github: '@profullstack/sh1pt-secrets-github',
  railway: '@profullstack/sh1pt-secrets-railway',
  onepassword: '@profullstack/sh1pt-secrets-onepassword',
  'env-updater': '@profullstack/sh1pt-secrets-env-updater',
};

function providerId(slug: string): string {
  return `secrets-${slug}`;
}

interface EnvUpdateOpts {
  from?: string;
  to?: string[];
  envFile?: string;
  exclude?: string[];
  include?: string[];
}

interface EnvDiffOpts {
  source?: string;
  target?: string;
  envFile?: string;
  exclude?: string[];
  include?: string[];
}

secretsCmd
  .command('env-update')
  .description('Sync environment variables across providers (.env, Doppler, Railway, GitHub Secrets)')
  .option('--from <provider>', 'source provider slug (default: dotenvx)', 'dotenvx')
  .option('--to <providers...>', 'target provider slugs (comma-separated or repeated)')
  .option('--env-file <path>', 'path to .env file (for dotenvx provider)', '.env')
  .option('--exclude <patterns...>', 'key patterns to exclude')
  .option('--include <patterns...>', 'key patterns to include')
  .action(async (opts: EnvUpdateOpts) => {
    const { ensureInstalled, loadInstalledPackage } = await import('../installer.js');
    const { registerSecretProvider, type SecretProvider } = await import('@profullstack/sh1pt-core');

    // Collect all provider slugs we need
    const fromSlug = opts.from ?? 'dotenvx';
    const toSlugs = (opts.to ?? []).flatMap((t) => t.split(',').map((s) => s.trim()).filter(Boolean));

    const allSlugs = [fromSlug, ...toSlugs];
    const pkgs = allSlugs
      .map((s) => PROVIDER_PACKAGES[s])
      .filter((p): p is string => p !== undefined);

    if (pkgs.length > 0) {
      try {
        await ensureInstalled([...new Set(pkgs)]);
      } catch (err) {
        console.error(kleur.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    }

    // Load and register each provider
    for (const slug of [...new Set(allSlugs)]) {
      const pkg = PROVIDER_PACKAGES[slug];
      if (!pkg) {
        console.error(kleur.yellow(`Unknown provider: ${slug}. Supported: ${Object.keys(PROVIDER_PACKAGES).join(', ')}`));
        process.exit(1);
      }
      try {
        const provider = await loadInstalledPackage<SecretProvider<any>>(pkg);
        if (provider) registerSecretProvider(provider);
      } catch {
        // Already registered or not loadable — skip
      }
    }

    // Load the env-updater orchestrator
    try {
      await ensureInstalled([PROVIDER_PACKAGES['env-updater']!]);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    let mod: typeof import('@profullstack/sh1pt-secrets-env-updater');
    try {
      mod = await import('@profullstack/sh1pt-secrets-env-updater');
    } catch (err) {
      console.error(kleur.red(`Failed to load env-updater: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const ctx = {
      secret: (k: string) => undefined as string | undefined,
      log: (m: string) => console.log(kleur.dim(m)),
    };

    // Resolve vault secrets lazily
    try {
      ctx.secret = (k: string) => {
        // Sync lookup not possible — return undefined; providers use direct values
        return undefined;
      };
    } catch {
      // vault not available
    }

    const sourceConfig: Record<string, unknown> = {};
    if (fromSlug === 'dotenvx') sourceConfig.envFile = opts.envFile;

    const targetConfigs = toSlugs.map((slug) => {
      const config: Record<string, unknown> = {};
      if (slug === 'dotenvx') config.envFile = opts.envFile;
      return { id: providerId(slug), config };
    });

    const syncConfig = {
      excludeKeys: opts.exclude,
      includeKeys: opts.include,
    };

    try {
      console.log(kleur.cyan(`Pulling from ${fromSlug}…`));
      const secrets = await mod.pullFrom(ctx, { id: providerId(fromSlug), config: sourceConfig }, syncConfig);
      console.log(kleur.green(`  ${secrets.length} keys pulled`));

      if (targetConfigs.length === 0) {
        console.log(kleur.yellow('No --to targets specified. Use --to <provider> to push secrets.'));
        return;
      }

      console.log(kleur.cyan(`Pushing to ${toSlugs.join(', ')}…`));
      const results = await mod.syncEnv(
        ctx,
        { id: providerId(fromSlug), config: sourceConfig },
        targetConfigs,
        syncConfig,
      );

      for (const result of results) {
        const icon = result.status === 'ok' ? kleur.green('✓')
          : result.status === 'skipped' ? kleur.dim('–')
          : kleur.red('✗');
        console.log(`  ${icon} ${result.provider}: ${result.status === 'ok' ? `${result.count} keys` : result.status}${result.error ? ` (${result.error})` : ''}`);
      }
    } catch (err) {
      console.error(kleur.red(`env-update failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

secretsCmd
  .command('env-diff')
  .description('Compare environment variables between two providers')
  .option('--source <provider>', 'source provider slug (default: dotenvx)', 'dotenvx')
  .option('--target <provider>', 'target provider slug (required)')
  .option('--env-file <path>', 'path to .env file (for dotenvx provider)', '.env')
  .option('--exclude <patterns...>', 'key patterns to exclude')
  .option('--include <patterns...>', 'key patterns to include')
  .action(async (opts: EnvDiffOpts) => {
    if (!opts.target) {
      console.error(kleur.yellow('--target is required. Use --target <provider> (e.g. doppler, railway, github).'));
      process.exit(1);
    }

    const { ensureInstalled, loadInstalledPackage } = await import('../installer.js');
    const { registerSecretProvider, type SecretProvider } = await import('@profullstack/sh1pt-core');

    const sourceSlug = opts.source ?? 'dotenvx';
    const targetSlug = opts.target;
    const slugs = [sourceSlug, targetSlug];
    const pkgs = slugs
      .map((s) => PROVIDER_PACKAGES[s])
      .filter((p): p is string => p !== undefined);

    if (pkgs.length > 0) {
      try {
        await ensureInstalled([...new Set(pkgs)]);
      } catch (err) {
        console.error(kleur.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    }

    for (const slug of [...new Set(slugs)]) {
      const pkg = PROVIDER_PACKAGES[slug];
      if (!pkg) {
        console.error(kleur.yellow(`Unknown provider: ${slug}. Supported: ${Object.keys(PROVIDER_PACKAGES).join(', ')}`));
        process.exit(1);
      }
      try {
        const provider = await loadInstalledPackage<SecretProvider<any>>(pkg);
        if (provider) registerSecretProvider(provider);
      } catch {
        // Already registered
      }
    }

    try {
      await ensureInstalled([PROVIDER_PACKAGES['env-updater']!]);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    let mod: typeof import('@profullstack/sh1pt-secrets-env-updater');
    try {
      mod = await import('@profullstack/sh1pt-secrets-env-updater');
    } catch (err) {
      console.error(kleur.red(`Failed to load env-updater: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const ctx = {
      secret: () => undefined as string | undefined,
      log: (m: string) => console.log(kleur.dim(m)),
    };

    const sourceConfig: Record<string, unknown> = {};
    if (sourceSlug === 'dotenvx') sourceConfig.envFile = opts.envFile;

    const targetConfig: Record<string, unknown> = {};
    if (targetSlug === 'dotenvx') targetConfig.envFile = opts.envFile;

    try {
      const entries = await mod.diffEnv(
        ctx,
        { id: providerId(sourceSlug), config: sourceConfig },
        { id: providerId(targetSlug), config: targetConfig },
        { excludeKeys: opts.exclude, includeKeys: opts.include },
      );

      const added = entries.filter((e) => e.status === 'added');
      const removed = entries.filter((e) => e.status === 'removed');
      const changed = entries.filter((e) => e.status === 'changed');
      const unchanged = entries.filter((e) => e.status === 'unchanged');

      console.log(kleur.bold(`Diff: ${sourceSlug} → ${targetSlug}`));
      console.log(`  ${kleur.green(`+${added.length} added`)}  ${kleur.red(`-${removed.length} removed`)}  ${kleur.yellow(`~${changed.length} changed`)}  ${kleur.dim(`${unchanged.length} unchanged`)}`);

      if (added.length) {
        console.log(kleur.green('\n  Added (in source, not in target):'));
        for (const e of added) console.log(`    ${kleur.green('+')} ${e.key}`);
      }
      if (removed.length) {
        console.log(kleur.red('\n  Removed (in target, not in source):'));
        for (const e of removed) console.log(`    ${kleur.red('-')} ${e.key}`);
      }
      if (changed.length) {
        console.log(kleur.yellow('\n  Changed:'));
        for (const e of changed) console.log(`    ${kleur.yellow('~')} ${e.key}`);
      }
    } catch (err) {
      console.error(kleur.red(`env-diff failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });
