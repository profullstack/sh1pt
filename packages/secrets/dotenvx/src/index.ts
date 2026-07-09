import { readFile, writeFile } from 'node:fs/promises';
import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  envFile?: string;
}

const DEFAULT_ENV_FILE = '.env';
const ENV_ENTRY = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

function envFile(config: Config): string {
  return config.envFile ?? DEFAULT_ENV_FILE;
}

async function readEnvFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

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

function parseEntry(line: string): { prefix: string; key: string; spacing: string; value: string } | undefined {
  const match = ENV_ENTRY.exec(line);
  if (!match) return undefined;
  const [, prefix, key, spacing, value] = match;
  if (prefix === undefined || key === undefined || spacing === undefined || value === undefined) return undefined;
  return { prefix, key, spacing, value };
}

export default defineSecretProvider<Config>({
  id: 'secrets-dotenvx',
  label: 'dotenvx',
  cli: 'dotenvx',
  async connect(ctx, config) {
    const file = envFile(config);
    ctx.log(`dotenvx status · file=${file}`);
    return { accountId: file };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const file = envFile(config);
    ctx.log(`dotenvx get --all --env-file ${file}`);
    const text = await readEnvFile(file);
    return text
      .split(/\r?\n/)
      .flatMap((line) => {
        const entry = parseEntry(line);
        if (!entry) return [];
        return [{ key: entry.key, value: unquoteValue(entry.value), path: file }];
      });
  },
  async push(ctx, secrets, config) {
    const file = envFile(config);
    ctx.log(`dotenvx set <${secrets.length} keys> --env-file ${file}`);
    const pending = new Map(secrets.map((secret) => [secret.key, secret.value ?? '']));
    const text = await readEnvFile(file);
    const lines = text === '' ? [''] : text.split(/\r?\n/);
    const nextLines = lines.map((line) => {
      const entry = parseEntry(line);
      if (!entry || !pending.has(entry.key)) return line;
      const value = pending.get(entry.key)!;
      pending.delete(entry.key);
      return `${entry.prefix}${entry.key}${entry.spacing}${formatValue(value)}`;
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
    await writeFile(file, nextLines.join('\n'), 'utf8');
    return { count: secrets.length };
  },
  setup: manualSetup({
    label: 'dotenvx CLI',
    vendorDocUrl: 'https://dotenvx.com/docs',
    steps: [
      'Install with mise: mise use npm:@dotenvx/dotenvx',
      'Use dotenvx encrypt when committing encrypted .env files',
      'For private key based decrypts: sh1pt secret set DOTENV_PRIVATE_KEY <key>',
    ],
  }),
});
