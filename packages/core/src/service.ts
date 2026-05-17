// Service — self-hostable third-party services that sh1pt can provision
// alongside the user's app (auth, search, mail, monitoring, db, etc.).
//
// Catalog seeded from Coolify's 1-click service list (coolify.io/services).
// Each adapter is a thin metadata record + optional provision() hook;
// the actual deployment is delegated to a backend like deploy-coolify
// (Coolify HTTP API) or docker-compose. Keeping the interface small lets
// us enumerate hundreds of services without per-adapter implementation
// churn — they're catalog entries first, full integrations later.

import { autoSetup } from './setup-helpers.js';

export interface ServiceContext {
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  secret(k: string): string | undefined;
  dryRun: boolean;
}

export interface ServiceProvisionResult {
  id: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface Service<Config = unknown> {
  id: string;                        // e.g. 'service-authentik'
  label: string;                     // human name
  category: string;                  // 'auth' | 'search' | 'db' | ... (free-form; lets us add categories without core churn)
  description?: string;
  homepageUrl?: string;
  // Coolify catalog slug — matches the path under coolify.io/services/<slug>.
  // deploy-coolify uses this to look up the template when provisioning.
  coolifyTemplate?: string;
  provision?(ctx: ServiceContext, config: Config): Promise<ServiceProvisionResult>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineService<Config>(s: Service<Config>): Service<Config> {
  return autoSetup(s);
}

const serviceRegistry = new Map<string, Service<any>>();

export function registerService(s: Service<any>): void {
  if (serviceRegistry.has(s.id)) throw new Error(`Service already registered: ${s.id}`);
  serviceRegistry.set(s.id, s);
}

export function getService(id: string): Service<any> | undefined {
  return serviceRegistry.get(id);
}

export function listServices(): Service<any>[] {
  return [...serviceRegistry.values()];
}
