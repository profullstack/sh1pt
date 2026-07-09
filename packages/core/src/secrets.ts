import { autoSetup } from './setup-helpers.js';

export interface SecretRef {
  key: string;
  value?: string;
  environment?: string;
  path?: string;
}

export interface SecretProvider<Config = unknown> {
  id: string;
  label: string;
  cli: string;
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  pull(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<SecretRef[]>;
  push(ctx: { secret(k: string): string | undefined; log(m: string): void }, secrets: SecretRef[], config: Config): Promise<{ count: number }>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineSecretProvider<Config>(p: SecretProvider<Config>): SecretProvider<Config> {
  return autoSetup(p);
}

const secretRegistry = new Map<string, SecretProvider<any>>();

export function registerSecretProvider(p: SecretProvider<any>): void {
  if (secretRegistry.has(p.id)) throw new Error(`Secret provider already registered: ${p.id}`);
  secretRegistry.set(p.id, p);
}

export function getSecretProvider(id: string): SecretProvider<any> | undefined {
  return secretRegistry.get(id);
}

export function listSecretProviders(): SecretProvider<any>[] {
  return [...secretRegistry.values()];
}
