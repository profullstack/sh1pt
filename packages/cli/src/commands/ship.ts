import { Command } from 'commander';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import kleur from 'kleur';
import { lint } from '@profullstack/sh1pt-policy';
import type { Manifest } from '@profullstack/sh1pt-core';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { initAction } from './init.js';
import { categoryById, packageFor } from '../adapter-registry.js';

/**
 * Load the project manifest by dynamically importing a config file.
 * Uses Node's native import() with pathToFileURL for cross-platform safety.
 * Falls back to a stub if no config file is found.
 *
 * @param configPathOrDir  Path to a config file, or a directory (appends sh1pt.config.ts).
 *                         Defaults to process.cwd().
 */
export async function loadManifest(configPathOrDir?: string): Promise<Manifest> {
  const input = configPathOrDir ?? process.cwd();
  const resolved = resolve(input);

  // If input is a directory, look for the default config file inside it.
  // Otherwise treat the input as an explicit file path (supports --config flag).
  const isDirectory = existsSync(resolved) && statSync(resolved).isDirectory();
  const configPath = isDirectory
    ? join(resolved, 'sh1pt.config.ts')
    : resolved;

  if (!existsSync(configPath)) {
    return { name: 'unknown', version: '0.0.0', channels: [], targets: {} };
  }

  try {
    // pathToFileURL ensures Windows backslashes don't break dynamic import
    const mod = await import(pathToFileURL(configPath).href);

    // Schema validation
    const candidate = (mod.default ?? mod) as Record<string, unknown>;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      console.error(kleur.red(`error: ${configPath} must export an object`));
      process.exit(1);
    }
    if (!candidate.name || !candidate.targets) {
      console.warn(kleur.yellow(
        `warning: ${configPath} is missing required fields (name, targets)`));
    }

    return candidate as unknown as Manifest;
  } catch (err) {
    const message = (err as Error).message || String(err);
    throw new Error(`cannot load config file "${configPath}": ${message}`);
  }
}

export const shipCmd = new Command('ship')
  .description('Publish built artifacts to their target stores and registries')
  .option('-t, --target <id...>', 'target ids to ship (default: all enabled)')
  .option('-c, --channel <name>', 'release channel', 'stable')
  .option('--cloud', 'run submission, retries, polling, and logs in sh1pt cloud')
  .option('--dry-run', 'simulate without uploading')
  .option('--skip-lint', 'skip the pre-ship policy linter (not recommended)')
  .action(async (opts: { target?: string[]; channel: string; cloud?: boolean; dryRun?: boolean; skipLint?: boolean }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    const tag = opts.dryRun ? kleur.yellow('[dry-run]') : kleur.green('[live]');
    const where = opts.cloud ? 'cloud' : 'local';
    if (!opts.skipLint) {
      console.log(kleur.dim('running pre-ship policy linter…'));
    }
    console.log(`${tag} ship (${where}) · channel=${opts.channel} · targets=${targets}`);
  });

shipCmd
  .command('init')
  .description('Scaffold sh1pt.config.ts in the current project')
  .action(initAction);

shipCmd
  .command('setup')
  .description('Connect store credentials')
  .option('--store <id...>', 'only set up these stores')
  .option('--poll', 're-check every 30s until all stores connected')
  .action((opts: { store?: string[]; poll?: boolean }) => {
    const stores = opts.store?.join(', ') ?? 'all targets from manifest';
    console.log(kleur.cyan(`[stub] ship setup · stores=${stores}`));
  });

shipCmd
  .command('status')
  .description('Current release status across targets')
  .option('-t, --target <id>')
  .option('--json')
  .action((opts: { target?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ releases: [], live: {}, inReview: {} }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] ship status · target=${opts.target ?? 'all'}`));
  });

shipCmd
  .command('rollback')
  .description('Roll back the latest release on one or more targets')
  .option('-t, --target <id...>')
  .action((opts: { target?: string[] }) => {
    const targets = opts.target?.join(', ') ?? 'all enabled';
    console.log(kleur.yellow(`[stub] ship rollback · targets=${targets}`));
  });

shipCmd
  .command('lint')
  .description('Check manifest against store-policy rules')
  .option('--strict', 'exit non-zero on warnings')
  .option('--json')
  .action(async (opts: { strict?: boolean; json?: boolean }) => {
    const manifest = await loadManifest();
    const result = await lint({ manifest, projectDir: process.cwd() });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const f of result.findings) {
        const color = f.severity === 'error' ? kleur.red : f.severity === 'warn' ? kleur.yellow : kleur.dim;
        const loc = f.path ? kleur.dim(` ${f.path}`) : '';
        console.log(`${color(`[${f.severity}]`)} ${kleur.dim(f.ruleId)}${loc} — ${f.message}`);
        if (f.fix) console.log(`       ${kleur.dim('fix:')} ${f.fix}`);
      }
      console.log(`
${result.errors} error(s), ${result.warnings} warning(s)`);
    }
    if (result.errors > 0 || (opts.strict && result.warnings > 0)) process.exit(1);
  });

shipCmd
  .command('logs')
  .description('Tail build and ship logs')
  .option('-t, --target <id>')
  .option('-f, --follow')
  .action((opts: { target?: string; follow?: boolean }) => {
    console.log(kleur.dim(`[stub] ship logs · target=${opts.target ?? 'all'} · follow=${!!opts.follow}`));
  });

const targetSubCmd = shipCmd.command('target').description('Manage targets in the manifest');

function defaultConfigPath(): string {
  return join(process.cwd(), 'sh1pt.config.ts');
}

export function availableTargetAdapters(): Array<{
  id: string;
  package: string;
  setupCommand: string;
}> {
  const targets = categoryById('targets');
  if (!targets) return [];
  return targets.adapters.map((id) => ({
    id,
    package: packageFor(targets, id),
    setupCommand: `sh1pt targets ${id} setup`,
  }));
}

export function addTargetToConfig(configPath: string, id: string): void {
  const adapter = availableTargetAdapters().find((target) => target.id === id);
  if (!adapter) {
    throw new Error(`unknown target adapter "${id}". Run \`sh1pt ship target available\` to list options.`);
  }
  if (!existsSync(configPath)) {
    throw new Error(`missing ${configPath}. Run \`sh1pt init\` first.`);
  }

  const source = readFileSync(configPath, 'utf8');
  const manifest = targetEntriesFromSource(source, configPath);
  if (Object.hasOwn(manifest, id)) {
    throw new Error(`target "${id}" already exists in ${configPath}`);
  }

  const range = findTargetsObject(source);
  if (!range) {
    throw new Error(`${configPath} does not contain a targets object`);
  }

  const entry = `    ${JSON.stringify(id)}: { use: ${JSON.stringify(id)}, config: {} },\n`;
  const updated = `${source.slice(0, range.close)}${entry}${source.slice(range.close)}`;
  writeFileSync(configPath, updated, 'utf8');
}

export function removeTargetFromConfig(configPath: string, id: string): void {
  if (!existsSync(configPath)) {
    throw new Error(`missing ${configPath}. Run \`sh1pt init\` first.`);
  }

  const source = readFileSync(configPath, 'utf8');
  const manifest = targetEntriesFromSource(source, configPath);
  if (!Object.hasOwn(manifest, id)) {
    throw new Error(`target "${id}" does not exist in ${configPath}`);
  }

  const property = targetPropertyPattern(id).exec(source);
  if (!property) {
    throw new Error(`target "${id}" exists but cannot be removed automatically from ${configPath}`);
  }

  const updated = `${source.slice(0, property.index)}${source.slice(property.index + property[0].length)}`;
  writeFileSync(configPath, updated, 'utf8');
}

function targetEntriesFromSource(source: string, configPath: string): Record<string, unknown> {
  const range = findTargetsObject(source);
  if (!range) {
    throw new Error(`${configPath} does not contain a targets object`);
  }

  const entries = [...source.slice(range.open + 1, range.close).matchAll(/['"]?([A-Za-z0-9_-]+)['"]?\s*:/g)];
  return Object.fromEntries(entries.map((match) => [match[1]!, true]));
}

function findTargetsObject(source: string): { open: number; close: number } | undefined {
  const targets = /targets\s*:\s*{/.exec(source);
  if (!targets) return undefined;
  const open = targets.index + targets[0].lastIndexOf('{');
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return { open, close: i };
    }
  }
  return undefined;
}

function targetPropertyPattern(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*['"]?${escaped}['"]?\\s*:\\s*\\{\\s*use:\\s*['"][^'"]+['"]\\s*,\\s*config:\\s*\\{\\s*\\}\\s*\\},?\\r?\\n`, 'm');
}

targetSubCmd
  .command('add <id>')
  .description('Add a target adapter to sh1pt.config.ts')
  .option('-c, --config <path>', 'path to sh1pt.config.ts', defaultConfigPath())
  .action((id: string, opts: { config: string }) => {
    try {
      addTargetToConfig(resolve(opts.config), id);
      console.log(kleur.green(`added target ${id}`));
    } catch (err) {
      console.error(kleur.red(`error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

targetSubCmd
  .command('remove <id>')
  .description('Remove a target from sh1pt.config.ts')
  .option('-c, --config <path>', 'path to sh1pt.config.ts', defaultConfigPath())
  .action((id: string, opts: { config: string }) => {
    try {
      removeTargetFromConfig(resolve(opts.config), id);
      console.log(kleur.yellow(`removed target ${id}`));
    } catch (err) {
      console.error(kleur.red(`error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

targetSubCmd
  .command('list')
  .description('List enabled targets for this project')
  .option('--json', 'output as JSON for automation')
  .option('-c, --config <path>', 'path to alternate config file or directory')
  .action(async (opts: { json?: boolean; config?: string }) => {
    try {
      const manifest = await loadManifest(opts.config);
      const targetEntries = Object.entries(manifest.targets ?? {});

      if (opts.json) {
        const list = targetEntries.map(([id, t]) => ({
          id,
          use: t.use,
          enabled: t.enabled !== false,
        }));
        console.log(JSON.stringify(list, null, 2));
        return;
      }

      if (targetEntries.length === 0) {
        console.log(kleur.dim('No targets configured. Use sh1pt ship target add <id> to add one.'));
        return;
      }

      console.log(kleur.bold(`Configured targets (${targetEntries.length}):`));
      for (const [id, t] of targetEntries) {
        const status = t.enabled === false ? kleur.dim('(disabled)') : kleur.green('enabled');
        console.log(`  ${kleur.cyan(id)}  ${kleur.dim(`→ ${t.use}`)}  ${status}`);
      }
    } catch (err) {
      console.error(kleur.red(`error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

targetSubCmd
  .command('available')
  .description('List every target adapter available to install')
  .option('--json', 'output as JSON for automation')
  .action((opts: { json?: boolean }) => {
    const targets = availableTargetAdapters();

    if (opts.json) {
      console.log(JSON.stringify(targets, null, 2));
      return;
    }

    console.log(kleur.bold(`Available target adapters (${targets.length}):`));
    for (const target of targets) {
      console.log(`  ${kleur.cyan(target.id)}  ${kleur.dim(target.package)}`);
    }
  });
