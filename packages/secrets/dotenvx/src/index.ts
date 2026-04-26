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
    ctx.log(`dotenvx get --all --env-file ${config.envFile ?? '.env'}`);
    return [];
  },
  async push(ctx, secrets, config) {
    ctx.log(`dotenvx set <${secrets.length} keys> --env-file ${config.envFile ?? '.env'}`);
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
