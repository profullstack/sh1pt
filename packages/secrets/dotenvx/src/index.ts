import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  envFile?: string;
}

export default defineSecretProvider<Config>({
  id: 'secrets-dotenvx',
  label: 'dotenvx',
  cli: 'dotenvx',
  async connect(ctx, config) {
    ctx.log(`dotenvx status · file=${config.envFile ?? '.env'}`);
    return { accountId: config.envFile ?? '.env' };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const envFile = config.envFile ?? '.env';
    ctx.log(`dotenvx read --env-file ${envFile}`);
    try {
      return parseEnvFile(await readFile(envFile, 'utf8'), envFile);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return [];
      throw err;
    }
  },
  async push(ctx, secrets, config) {
    const envFile = config.envFile ?? '.env';
    ctx.log(`dotenvx write <${secrets.length} keys> --env-file ${envFile}`);
    const current = await readFile(envFile, 'utf8').catch((err: unknown) => {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return '';
      throw err;
    });
    const next = upsertEnvSecrets(String(current), secrets);
    await mkdir(dirname(envFile), { recursive: true });
    await writeFile(envFile, next, 'utf8');
    return { count: secrets.filter((secret) => secret.value !== undefined).length };
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

function parseEnvFile(text: string, envFile: string): SecretRef[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) return [];
    return [{
      key: match[1]!,
      value: parseEnvValue(match[2] ?? ''),
      path: envFile,
    }];
  });
}

function upsertEnvSecrets(text: string, secrets: SecretRef[]): string {
  const lines = text ? text.replace(/\r\n/g, '\n').replace(/\n?$/, '\n').split('\n') : [''];
  const indexes = new Map<string, number>();
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) indexes.set(match[1]!, index);
  });

  for (const secret of secrets) {
    if (secret.value === undefined) continue;
    const line = `${secret.key}=${quoteEnvValue(secret.value)}`;
    const index = indexes.get(secret.key);
    if (index === undefined) {
      lines.splice(lines.length - 1, 0, line);
    } else {
      lines[index] = line;
    }
  }

  return lines.join('\n').replace(/\n*$/, '\n');
}

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/, '');
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`;
}
