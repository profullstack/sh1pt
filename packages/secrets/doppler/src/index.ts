import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  project: string;
  config: string;
}

export default defineSecretProvider<Config>({
  id: 'secrets-doppler',
  label: 'Doppler',
  cli: 'doppler',
  async connect(ctx, config) {
    if (!ctx.secret('DOPPLER_TOKEN')) throw new Error('DOPPLER_TOKEN not in vault');
    ctx.log(`doppler me · project=${config.project} · config=${config.config}`);
    return { accountId: config.project };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    ctx.log(`doppler secrets download --no-file --format json --project ${config.project} --config ${config.config}`);
    return [];
  },
  async push(ctx, secrets, config) {
    ctx.log(`doppler secrets set <${secrets.length} keys> --project ${config.project} --config ${config.config}`);
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
