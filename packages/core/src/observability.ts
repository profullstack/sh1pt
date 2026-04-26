import { autoSetup } from './setup-helpers.js';

export interface ObservabilityRelease {
  version: string;
  project?: string;
  environment?: string;
  artifacts?: string[];
}

export interface ObservabilityProvider<Config = unknown> {
  id: string;
  label: string;
  cli: string;
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  createRelease(ctx: { secret(k: string): string | undefined; log(m: string): void }, release: ObservabilityRelease, config: Config): Promise<{ id: string; url?: string }>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineObservabilityProvider<Config>(p: ObservabilityProvider<Config>): ObservabilityProvider<Config> {
  return autoSetup(p);
}

const observabilityRegistry = new Map<string, ObservabilityProvider<any>>();

export function registerObservabilityProvider(p: ObservabilityProvider<any>): void {
  if (observabilityRegistry.has(p.id)) throw new Error(`Observability provider already registered: ${p.id}`);
  observabilityRegistry.set(p.id, p);
}

export function getObservabilityProvider(id: string): ObservabilityProvider<any> | undefined {
  return observabilityRegistry.get(id);
}

export function listObservabilityProviders(): ObservabilityProvider<any>[] {
  return [...observabilityRegistry.values()];
}
