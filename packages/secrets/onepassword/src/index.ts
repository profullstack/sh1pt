import { defineSecretProvider, exec, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';

interface Config {
  vault: string;
  item?: string;
}

interface OnePasswordField {
  id?: string;
  label?: string;
  value?: string;
  type?: string;
}

interface OnePasswordItem {
  id?: string;
  title?: string;
  fields?: OnePasswordField[];
}

export default defineSecretProvider<Config>({
  id: 'secrets-onepassword',
  label: '1Password',
  cli: 'op',
  async connect(ctx, config) {
    ctx.log(`op whoami · vault=${config.vault}`);
    await runOp(ctx, ['whoami', '--format', 'json']);
    return { accountId: config.vault };
  },
  async pull(ctx, config): Promise<SecretRef[]> {
    const item = requireItem(config);
    ctx.log(`op item get ${item} --vault ${config.vault} --format json`);
    const result = await runOp(ctx, ['item', 'get', item, '--vault', config.vault, '--format', 'json']);
    return parseOnePasswordItem(result.stdout, config.vault);
  },
  async push(ctx, secrets, config) {
    const item = requireItem(config);
    if (secrets.length === 0) return { count: 0 };
    ctx.log(`op item edit ${item} <${secrets.length} fields> --vault ${config.vault}`);
    await runOp(ctx, [
      'item',
      'edit',
      item,
      '--vault',
      config.vault,
      ...secrets.map((secret) => `${secret.key}=${secret.value ?? ''}`),
    ]);
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

function requireItem(config: Config): string {
  if (!config.item) throw new Error('secrets-onepassword requires config.item');
  return config.item;
}

async function runOp(ctx: { log(m: string): void }, args: string[]) {
  try {
    return await exec('op', args, { log: ctx.log, throwOnNonZero: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('command not found: op')) {
      throw new Error('secrets-onepassword requires the 1Password CLI on PATH. Install it from https://developer.1password.com/docs/cli/');
    }
    throw error;
  }
}

function parseOnePasswordItem(stdout: string, vault: string): SecretRef[] {
  if (!stdout.trim()) return [];
  const item = JSON.parse(stdout) as OnePasswordItem;
  return (item.fields ?? [])
    .filter((field) => field.value !== undefined && isSecretField(field))
    .map((field) => ({
      key: field.label ?? field.id ?? 'field',
      value: field.value,
      path: item.title ?? item.id,
      environment: vault,
    }));
}

function isSecretField(field: OnePasswordField): boolean {
  return field.type === undefined || ['STRING', 'CONCEALED', 'EMAIL', 'URL', 'OTP'].includes(field.type);
}
