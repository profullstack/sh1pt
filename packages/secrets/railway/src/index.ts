import { defineSecretProvider, exec, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  service?: string;
  environment?: string;
  skipDeploys?: boolean;
}

interface RailwayVariableEntry {
  name?: string;
  key?: string;
  value?: string;
}

function scopedArgs(config: Config): string[] {
  const args: string[] = [];
  const service = config.service?.trim();
  const environment = config.environment?.trim();
  if (service) args.push('--service', service);
  if (environment) args.push('--environment', environment);
  return args;
}

function parseVariables(stdout: string): SecretRef[] {
  const body = stdout.trim();
  if (!body) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Unable to parse `railway variable list --json` output as JSON. Run `railway login` or set RAILWAY_TOKEN and retry.', {
      cause: error,
    });
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const variable = entry as RailwayVariableEntry;
      const key = variable.name ?? variable.key;
      return key ? [{ key, value: variable.value }] : [];
    });
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : undefined,
    }));
  }

  throw new Error('Expected `railway variable list --json` to return an object or array.');
}

function assertSecretKey(key: string): string {
  const normalized = key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`Railway variable key must be an environment-style name: ${key}`);
  }
  return normalized;
}

function redactSecretArgError(error: unknown, key: string, value: string): Error {
  const leakedArg = `${key}=${value}`;
  const redactedArg = `${key}=<redacted>`;

  if (error instanceof Error) {
    return new Error(error.message.split(leakedArg).join(redactedArg));
  }

  return new Error(`railway variable set ${redactedArg} failed`);
}

export default defineSecretProvider<Config>({
  id: 'secrets-railway',
  label: 'Railway Variables',
  cli: 'railway',
  async connect(ctx, config) {
    const scope = [
      config.service?.trim() ? `service=${config.service.trim()}` : undefined,
      config.environment?.trim() ? `environment=${config.environment.trim()}` : undefined,
    ].filter(Boolean).join(' · ') || 'linked project';
    ctx.log(`railway whoami · scope=${scope}`);
    await exec('railway', ['whoami'], { log: (message) => ctx.log(message), throwOnNonZero: true });
    return { accountId: scope };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const args = ['variable', 'list', '--json', ...scopedArgs(config)];
    ctx.log(`railway ${args.join(' ')}`);
    const result = await exec('railway', args, { log: (message) => ctx.log(message), throwOnNonZero: true });
    return parseVariables(result.stdout);
  },
  async push(ctx, secrets, config) {
    const commonArgs = ['variable', 'set', ...scopedArgs(config)];
    if (config.skipDeploys) commonArgs.push('--skip-deploys');

    for (const secret of secrets) {
      const key = assertSecretKey(secret.key);
      const value = secret.value ?? ctx.secret(key);
      if (value === undefined) {
        throw new Error(`No value provided for Railway variable ${key}`);
      }
      ctx.log(`railway ${commonArgs.join(' ')} ${key}=<redacted>`);
      try {
        await exec('railway', [...commonArgs, `${key}=${value}`], {
          log: (message) => ctx.log(message),
          throwOnNonZero: true,
        });
      } catch (error) {
        throw redactSecretArgError(error, key, value);
      }
    }

    return { count: secrets.length };
  },
  setup: manualSetup({
    label: 'Railway CLI',
    vendorDocUrl: 'https://docs.railway.com/cli/variable',
    steps: [
      'Install Railway CLI from the official docs',
      'Authenticate locally: railway login',
      'For CI/service use, set RAILWAY_TOKEN or RAILWAY_API_TOKEN',
      'Link the project with railway link or configure service/environment in sh1pt',
    ],
  }),
});
