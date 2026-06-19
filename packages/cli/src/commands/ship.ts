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
async function loadManifest(configPathOrDir?: string): Promise<Manifest> {
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
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      console.error(kleur.red(`error: cannot load config file "${configPath}"`));
      process.exit(1);
    }
    return { name: 'unknown', version: '0.0.0', channels: [], targets: {} };
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

export function upsertTargetInConfig(
  source: string,
  id: string,
  opts: { enabled?: boolean } = {},
): string {
  assertKnownTarget(id);
  const targets = findObjectProperty(source, 'targets');
  if (!targets) {
    throw new Error('No targets block found in sh1pt.config.ts. Run sh1pt ship init first.');
  }

  const withoutExisting = removeObjectEntryFromBody(source, targets.open + 1, targets.close, id);
  const nextTargets = findObjectProperty(withoutExisting, 'targets');
  if (!nextTargets) throw new Error('Failed to re-read targets block after update.');

  const entry = formatTargetEntry(id, opts);
  const body = withoutExisting.slice(nextTargets.open + 1, nextTargets.close);
  const insertion = body.trim().length === 0 || onlyLineComments(body)
    ? `\n    ${entry}\n  `
    : `${body.trimEnd().endsWith(',') ? '' : ','}\n    ${entry}`;

  return withoutExisting.slice(0, nextTargets.close) + insertion + withoutExisting.slice(nextTargets.close);
}

export function removeTargetFromConfig(source: string, id: string): string {
  const targets = findObjectProperty(source, 'targets');
  if (!targets) {
    throw new Error('No targets block found in sh1pt.config.ts. Run sh1pt ship init first.');
  }
  return removeObjectEntryFromBody(source, targets.open + 1, targets.close, id);
}

function resolveConfigPath(configPathOrDir: string): string {
  const resolved = resolve(configPathOrDir);
  const isDirectory = existsSync(resolved) && statSync(resolved).isDirectory();
  const configPath = isDirectory ? join(resolved, 'sh1pt.config.ts') : resolved;
  if (!existsSync(configPath)) {
    throw new Error(`No sh1pt config found at ${configPath}. Run sh1pt ship init first.`);
  }
  return configPath;
}

function assertKnownTarget(id: string): void {
  if (!availableTargetAdapters().some((target) => target.id === id)) {
    throw new Error(`Unknown target "${id}". Run sh1pt ship target available to list valid targets.`);
  }
}

function formatTargetEntry(id: string, opts: { enabled?: boolean }): string {
  const enabled = opts.enabled === false ? ', enabled: false' : '';
  return `${JSON.stringify(id)}: { use: ${JSON.stringify(`target-${id}`)}${enabled}, config: {} },`;
}

function onlyLineComments(body: string): boolean {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .every((line) => line.startsWith('//'));
}

function removeObjectEntryFromBody(source: string, bodyStart: number, bodyEnd: number, key: string): string {
  const entry = findTopLevelObjectEntry(source, bodyStart, bodyEnd, key);
  if (!entry) return source;
  return source.slice(0, entry.start) + source.slice(entry.end);
}

function findObjectProperty(source: string, property: string): { open: number; close: number } | undefined {
  const match = new RegExp(`(?:^|[,{\\s])${escapeRegExp(property)}\\s*:`).exec(source);
  if (!match) return undefined;
  const open = source.indexOf('{', match.index + match[0].length);
  if (open === -1) return undefined;
  const close = findMatchingBrace(source, open);
  return close === -1 ? undefined : { open, close };
}

function findTopLevelObjectEntry(
  source: string,
  bodyStart: number,
  bodyEnd: number,
  key: string,
): { start: number; end: number } | undefined {
  const entryRe = new RegExp(`(?:^|,)\\s*(["']?)${escapeRegExp(key)}\\1\\s*:`, 'g');
  const body = source.slice(bodyStart, bodyEnd);
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(body))) {
    const colon = bodyStart + match.index + match[0].length;
    const open = source.indexOf('{', colon);
    if (open === -1 || open > bodyEnd) continue;
    const between = source.slice(colon, open).trim();
    if (between.length > 0) continue;
    const close = findMatchingBrace(source, open);
    if (close === -1 || close > bodyEnd) continue;
    let start = bodyStart + match.index;
    let end = close + 1;
    if (source[end] === ',') end += 1;
    while (source[end] === '\r' || source[end] === '\n') end += 1;
    while (start > bodyStart && /[ \t]/.test(source[start - 1]!)) start -= 1;
    return { start, end };
  }
  return undefined;
}

function findMatchingBrace(source: string, open: number): number {
  let depth = 0;
  let quote: '"' | "'" | '`' | undefined;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

targetSubCmd
  .command('add <id>')
  .description('Add a target adapter to sh1pt.config.ts')
  .option('-c, --config <path>', 'path to sh1pt config file or directory', process.cwd())
  .option('--disabled', 'add the target with enabled: false')
  .action((id: string, opts: { config: string; disabled?: boolean }) => {
    const configPath = resolveConfigPath(opts.config);
    const next = upsertTargetInConfig(readFileSync(configPath, 'utf8'), id, {
      enabled: opts.disabled ? false : undefined,
    });
    writeFileSync(configPath, next, 'utf8');
    const status = opts.disabled ? 'disabled' : 'enabled';
    console.log(`${kleur.green('added target')} ${kleur.cyan(id)} ${kleur.dim(`(${status})`)}`);
    console.log(kleur.dim(`config: ${configPath}`));
  });

targetSubCmd
  .command('remove <id>')
  .description('Remove a target from sh1pt.config.ts')
  .option('-c, --config <path>', 'path to sh1pt config file or directory', process.cwd())
  .action((id: string, opts: { config: string }) => {
    const configPath = resolveConfigPath(opts.config);
    const next = removeTargetFromConfig(readFileSync(configPath, 'utf8'), id);
    writeFileSync(configPath, next, 'utf8');
    console.log(`${kleur.yellow('removed target')} ${kleur.cyan(id)}`);
    console.log(kleur.dim(`config: ${configPath}`));
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
