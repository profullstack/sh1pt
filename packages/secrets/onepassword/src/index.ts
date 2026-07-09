import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  vault: string;
  item?: string;
}

export default defineSecretProvider<Config>({
  id: 'secrets-onepassword',
  label: '1Password',
  cli: 'op',
  async connect(ctx, config) {
    ctx.log(`op whoami · vault=${config.vault}`);
    return { accountId: config.vault };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    ctx.log(`op item get ${config.item ?? '<item>'} --vault ${config.vault} --format json`);
    return [];
  },
  async push(ctx, secrets, config) {
    ctx.log(`op item edit ${config.item ?? '<item>'} <${secrets.length} fields> --vault ${config.vault}`);
    return { count: secrets.length };
  },
  setup: manualSetup({
    label: '1Password CLI',
    vendorDocUrl: 'https://developer.1password.com/docs/cli/',
    steps: [
      'Install the 1Password CLI (`op`) from the official docs',
      'Authenticate: op signin',
      'Prefer desktop-app biometric unlock for local workflows',
    ],
  }),
});
