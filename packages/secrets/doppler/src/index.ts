import { defineSecretProvider, exec, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  project: string;
  config: string;
  tokenKey?: string;
}

interface DopplerSecret {
  computed?: string | null;
  raw?: string | null;
}

export default defineSecretProvider<Config>({
  id: 'secrets-doppler',
  label: 'Doppler',
  cli: 'doppler',
  async connect(ctx, config) {
    const tokenKey = config.tokenKey ?? 'DOPPLER_TOKEN';
    const token = ctx.secret(tokenKey);
    if (!token) throw new Error(`${tokenKey} not in vault`);
    ctx.log(`doppler me · project=${config.project} · config=${config.config}`);
    await runDoppler(ctx, ['me', '--json'], config, token);
    return { accountId: config.project };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const token = requireToken(ctx, config);
    ctx.log(`doppler secrets download · project=${config.project} · config=${config.config}`);
    const result = await runDoppler(ctx, [
      'secrets',
      'download',
      '--no-file',
      '--format',
      'json',
      '--project',
      config.project,
      '--config',
      config.config,
    ], config, token);
    return parseDopplerSecrets(result.stdout, config.config);
  },
  async push(ctx, secrets, config) {
    const token = requireToken(ctx, config);
    if (secrets.length === 0) return { count: 0 };
    const args = [
      'secrets',
      'set',
      '--project',
      config.project,
      '--config',
      config.config,
      ...secrets.map((secret) => `${secret.key}=${secret.value ?? ''}`),
    ];
    ctx.log(`doppler secrets set <${secrets.length} keys> · project=${config.project} · config=${config.config}`);
    await runDoppler(ctx, args, config, token);
    return { count: secrets.length };
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

function requireToken(ctx: { secret(k: string): string | undefined }, config: Config): string {
  const tokenKey = config.tokenKey ?? 'DOPPLER_TOKEN';
  const token = ctx.secret(tokenKey);
  if (!token) throw new Error(`${tokenKey} not in vault`);
  return token;
}

async function runDoppler(
  ctx: { log(m: string): void },
  args: string[],
  config: Config,
  token: string,
) {
  try {
    return await exec('doppler', args, {
      log: ctx.log,
      throwOnNonZero: true,
      env: {
        DOPPLER_TOKEN: token,
        DOPPLER_PROJECT: config.project,
        DOPPLER_CONFIG: config.config,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('command not found: doppler')) {
      throw new Error('secrets-doppler requires the Doppler CLI on PATH. Install it from https://docs.doppler.com/docs/cli');
    }
    throw error;
  }
}

function parseDopplerSecrets(stdout: string, environment: string): SecretRef[] {
  if (!stdout.trim()) return [];
  const data = JSON.parse(stdout) as Record<string, string | DopplerSecret>;
  return Object.entries(data).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : value.computed ?? value.raw ?? '',
    environment,
  }));
}
