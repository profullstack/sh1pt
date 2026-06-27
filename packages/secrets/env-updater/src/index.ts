import { readFile, writeFile } from 'node:fs/promises';
import {
  defineSecretProvider,
  getSecretProvider,
  manualSetup,
  type SecretProvider,
  type SecretRef,
} from '@profullstack/sh1pt-core';

// Environment updater plugin — orchestrates secret synchronization across
// multiple providers (.env files, Doppler, Railway, GitHub Secrets).
//
// This module provides two things:
//   1. A SecretProvider adapter (`secrets-env-updater`) that wraps a
//      configurable set of upstream providers and exposes pull/push as
//      fan-out operations.
//   2. Standalone helpers (pullFrom, pushTo, syncEnv, diffEnv) that
//      consumers can import directly to build custom sync workflows.
//
// The orchestrator never re-implements provider-specific logic — it
// delegates to the registered SecretProvider instances via the core
// registry. Adding a new secret backend is a matter of registering
// its provider; the env-updater picks it up automatically.

export interface ProviderTarget {
  /** Registered provider id, e.g. 'secrets-dotenvx', 'secrets-doppler'. */
  id: string;
  /** Provider-specific config passed through to connect/pull/push. */
  config?: Record<string, unknown>;
}

export interface EnvUpdateConfig {
  /** Default source provider for pull operations. */
  source?: ProviderTarget;
  /** Default target providers for push operations. */
  targets?: ProviderTarget[];
  /** .env file path when using the built-in dotenvx provider. */
  envFile?: string;
  /** Keys to exclude from synchronization (glob patterns). */
  excludeKeys?: string[];
  /** Only sync keys matching these patterns. */
  includeKeys?: string[];
}

export interface SyncResult {
  provider: string;
  status: 'ok' | 'error' | 'skipped';
  count: number;
  error?: string;
}

export interface DiffEntry {
  key: string;
  sourceValue?: string;
  targetValue?: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

interface Ctx {
  secret(k: string): string | undefined;
  log(m: string): void;
}

// ---------------------------------------------------------------------------
// Key filtering
// ---------------------------------------------------------------------------

function matchesGlob(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return regex.test(value);
}

function filterKeys(secrets: SecretRef[], config: EnvUpdateConfig): SecretRef[] {
  let filtered = secrets;
  if (config.includeKeys?.length) {
    filtered = filtered.filter((s) => config.includeKeys!.some((p) => matchesGlob(s.key, p)));
  }
  if (config.excludeKeys?.length) {
    filtered = filtered.filter((s) => !config.excludeKeys!.some((p) => matchesGlob(s.key, p)));
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

function resolveProvider(target: ProviderTarget): SecretProvider<any> {
  const provider = getSecretProvider(target.id);
  if (!provider) {
    throw new Error(
      `Secret provider not registered: ${target.id}. ` +
        `Make sure the adapter package is installed and imported.`,
    );
  }
  return provider;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Pull secrets from a single provider. */
export async function pullFrom(
  ctx: Ctx,
  target: ProviderTarget,
  config: EnvUpdateConfig = {},
): Promise<SecretRef[]> {
  const provider = resolveProvider(target);
  const merged = { ...config, ...target.config };
  ctx.log(`env-updater: pulling from ${target.id}`);
  const secrets = await provider.pull(ctx, merged);
  return filterKeys(secrets, config);
}

/** Push secrets to a single provider. */
export async function pushTo(
  ctx: Ctx,
  secrets: SecretRef[],
  target: ProviderTarget,
  config: EnvUpdateConfig = {},
): Promise<SyncResult> {
  const provider = resolveProvider(target);
  const merged = { ...config, ...target.config };
  const filtered = filterKeys(secrets, config);

  try {
    ctx.log(`env-updater: pushing ${filtered.length} keys to ${target.id}`);
    const result = await provider.push(ctx, filtered, merged);
    return { provider: target.id, status: 'ok', count: result.count };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.log(`env-updater: error pushing to ${target.id}: ${message}`);
    return { provider: target.id, status: 'error', count: 0, error: message };
  }
}

/** Sync secrets from a source provider to one or more target providers. */
export async function syncEnv(
  ctx: Ctx,
  source: ProviderTarget,
  targets: ProviderTarget[],
  config: EnvUpdateConfig = {},
): Promise<SyncResult[]> {
  const secrets = await pullFrom(ctx, source, config);
  ctx.log(`env-updater: pulled ${secrets.length} keys from ${source.id}`);

  const results: SyncResult[] = [];
  for (const target of targets) {
    if (target.id === source.id) {
      results.push({ provider: target.id, status: 'skipped', count: 0 });
      continue;
    }
    results.push(await pushTo(ctx, secrets, target, config));
  }
  return results;
}

/** Diff secrets between two providers, returning per-key change status. */
export async function diffEnv(
  ctx: Ctx,
  source: ProviderTarget,
  target: ProviderTarget,
  config: EnvUpdateConfig = {},
): Promise<DiffEntry[]> {
  const [sourceSecrets, targetSecrets] = await Promise.all([
    pullFrom(ctx, source, config),
    pullFrom(ctx, target, config),
  ]);

  const sourceMap = new Map(sourceSecrets.map((s) => [s.key, s.value ?? '']));
  const targetMap = new Map(targetSecrets.map((s) => [s.key, s.value ?? '']));
  const allKeys = new Set([...sourceMap.keys(), ...targetMap.keys()]);

  const entries: DiffEntry[] = [];
  for (const key of [...allKeys].sort()) {
    const sourceValue = sourceMap.get(key);
    const targetValue = targetMap.get(key);

    let status: DiffEntry['status'];
    if (sourceValue === undefined) status = 'removed';
    else if (targetValue === undefined) status = 'added';
    else if (sourceValue !== targetValue) status = 'changed';
    else status = 'unchanged';

    entries.push({ key, sourceValue, targetValue, status });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// .env file helpers (lightweight, no dotenvx dependency)
// ---------------------------------------------------------------------------

const ENV_ENTRY = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

function unquoteValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\([nrt"\\])/g, (_match, escaped: string) => {
      if (escaped === 'n') return '\n';
      if (escaped === 'r') return '\r';
      if (escaped === 't') return '\t';
      return escaped;
    });
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

function formatValue(value: string): string {
  if (value === '') return '';
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`;
}

/** Read a .env file and return parsed key-value pairs. */
export async function readEnvFile(path: string): Promise<SecretRef[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }

  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = ENV_ENTRY.exec(line);
      if (!match) return [];
      const [, , key, , value] = match;
      if (key === undefined || value === undefined) return [];
      return [{ key, value: unquoteValue(value), path }];
    });
}

/** Write secrets to a .env file, preserving existing entries and comments. */
export async function writeEnvFile(path: string, secrets: SecretRef[]): Promise<number> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      text = '';
    } else {
      throw error;
    }
  }

  const pending = new Map(secrets.map((s) => [s.key, s.value ?? '']));
  const lines = text === '' ? [''] : text.split(/\r?\n/);

  const nextLines = lines.map((line) => {
    const match = ENV_ENTRY.exec(line);
    if (!match) return line;
    const [, prefix, key, spacing, value] = match;
    if (prefix === undefined || key === undefined || spacing === undefined || value === undefined) return line;
    if (!pending.has(key)) return line;
    const newValue = pending.get(key)!;
    pending.delete(key);
    return `${prefix}${key}${spacing}${formatValue(newValue)}`;
  });

  const additions = [...pending].map(([key, value]) => `${key}=${formatValue(value)}`);
  if (additions.length) {
    if (nextLines.length === 1 && nextLines[0] === '') {
      nextLines.splice(0, 1, ...additions, '');
    } else if (nextLines[nextLines.length - 1] === '') {
      nextLines.push(...additions, '');
    } else {
      nextLines.push(...additions);
    }
  }

  await writeFile(path, nextLines.join('\n'), 'utf8');
  return secrets.length;
}

// ---------------------------------------------------------------------------
// SecretProvider adapter
// ---------------------------------------------------------------------------

const envUpdaterAdapter = defineSecretProvider<EnvUpdateConfig>({
  id: 'secrets-env-updater',
  label: 'Environment Updater',
  cli: 'sh1pt',

  async connect(ctx, config) {
    const sourceId = config.source?.id ?? 'secrets-dotenvx';
    const targetCount = config.targets?.length ?? 0;
    ctx.log(`env-updater: source=${sourceId} · targets=${targetCount}`);

    // Verify source provider is registered
    if (!getSecretProvider(sourceId)) {
      throw new Error(`Source provider not registered: ${sourceId}`);
    }

    // Verify target providers are registered
    for (const target of config.targets ?? []) {
      if (!getSecretProvider(target.id)) {
        throw new Error(`Target provider not registered: ${target.id}`);
      }
    }

    return { accountId: `${sourceId}→${targetCount} targets` };
  },

  async pull(ctx, config): Promise<SecretRef[]> {
    const source = config.source ?? { id: 'secrets-dotenvx', config: { envFile: config.envFile } };
    return pullFrom(ctx, source, config);
  },

  async push(ctx, secrets, config) {
    const targets = config.targets ?? [];
    if (targets.length === 0) {
      ctx.log('env-updater: no targets configured, writing to default .env');
      const envFile = config.envFile ?? '.env';
      const count = await writeEnvFile(envFile, filterKeys(secrets, config));
      return { count };
    }

    let totalCount = 0;
    for (const target of targets) {
      const result = await pushTo(ctx, secrets, target, config);
      if (result.status === 'ok') totalCount += result.count;
      if (result.status === 'error') {
        ctx.log(`env-updater: failed to push to ${target.id}: ${result.error}`);
      }
    }
    return { count: totalCount };
  },

  setup: manualSetup({
    label: 'Environment Updater',
    vendorDocUrl: 'https://github.com/profullstack/sh1pt',
    steps: [
      'Configure source and target providers in sh1pt.config.ts or pass via CLI flags',
      'Supported providers: dotenvx (.env files), doppler, railway, github',
      'Install the adapter packages for each provider you want to sync with',
      'Run: sh1pt secrets env-updater setup to verify connections',
    ],
  }),
});

export default envUpdaterAdapter;
