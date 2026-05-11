import { defineSecretProvider, exec, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  project: string;
  config: string;
  tokenEnv?: string;
}

export default defineSecretProvider<Config>({
  id: 'secrets-doppler',
  label: 'Doppler',
  cli: 'doppler',
  async connect(ctx, config) {
    requireToken(ctx, config);
    ctx.log(`doppler me · project=${config.project} · config=${config.config}`);
    return { accountId: config.project };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    ctx.log(`doppler secrets download --no-file --format json --project ${config.project} --config ${config.config}`);
    const result = await runDoppler(ctx, config, [
      'secrets',
      'download',
      '--no-file',
      '--format',
      'json',
      '--project',
      config.project,
      '--config',
      config.config,
    ]);
    return parseDopplerSecrets(result.stdout, config);
  },
  async push(ctx, secrets, config) {
    const args = buildDopplerSetArgs(secrets, config);
    ctx.log(`doppler secrets set <${args.values.length} keys> --project ${config.project} --config ${config.config}`);
    if (args.values.length === 0) return { count: 0 };
    await runDoppler(ctx, config, args.argv);
    return { count: args.values.length };
  },
  setup: manualSetup({
    label: 'Doppler CLI',
    vendorDocUrl: 'https://docs.doppler.com/docs/cli',
    steps: [
      'Install Doppler CLI from the official docs',
      'Authenticate locally: doppler login',
      'For CI/service use: sh1pt secret set DOPPLER_TOKEN <token>',
    ],
  }),
});

type SecretContext = {
  secret(k: string): string | undefined;
  log(m: string): void;
};

interface DopplerSetArgs {
  argv: string[];
  values: string[];
}

export function parseDopplerSecrets(json: string, config: Pick<Config, 'project' | 'config'>): SecretRef[] {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) throw new Error('Doppler secrets response must be a JSON object');

  const path = `doppler://${config.project}/${config.config}`;
  return Object.entries(parsed).flatMap(([key, value]) => {
    const secretValue = normalizeSecretValue(value);
    if (secretValue === undefined) return [];
    return [{
      key,
      value: secretValue,
      environment: config.config,
      path,
    }];
  });
}

export function buildDopplerSetArgs(secrets: SecretRef[], config: Pick<Config, 'project' | 'config'>): DopplerSetArgs {
  const values = secrets
    .filter((secret): secret is SecretRef & { value: string } => secret.value !== undefined)
    .map((secret) => `${assertDopplerKey(secret.key)}=${secret.value}`);

  return {
    values,
    argv: [
      'secrets',
      'set',
      ...values,
      '--project',
      config.project,
      '--config',
      config.config,
    ],
  };
}

async function runDoppler(ctx: SecretContext, config: Config, args: string[]) {
  const token = requireToken(ctx, config);
  return exec('doppler', args, {
    env: { DOPPLER_TOKEN: token },
    log: ctx.log,
  });
}

function requireToken(ctx: SecretContext, config: Pick<Config, 'tokenEnv'>): string {
  const tokenEnv = config.tokenEnv ?? 'DOPPLER_TOKEN';
  const token = ctx.secret(tokenEnv);
  if (!token) throw new Error(`${tokenEnv} not in vault`);
  return token;
}

function normalizeSecretValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value)) {
    if (typeof value.computed === 'string') return value.computed;
    if (typeof value.raw === 'string') return value.raw;
  }
  return JSON.stringify(value);
}

function assertDopplerKey(key: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid Doppler secret key: ${key}`);
  }
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
