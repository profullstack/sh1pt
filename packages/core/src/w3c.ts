import { autoSetup } from './setup-helpers.js';

export type W3cCapability =
  | 'discover'
  | 'publish'
  | 'receive'
  | 'subscribe'
  | 'notify'
  | 'verify';

export interface W3cEndpoint {
  id: string;
  label: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  rel?: string;
  pathHint?: string;
}

export interface W3cNamespace<Config = unknown> {
  id: string;
  label: string;
  specUrl: string;
  namespace: string;
  capabilities: readonly W3cCapability[];
  endpoints: readonly W3cEndpoint[];
  discover?(ctx: { log(m: string): void }, config: Config): Promise<W3cEndpoint[]>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineW3cNamespace<Config>(n: W3cNamespace<Config>): W3cNamespace<Config> {
  return autoSetup(n);
}

