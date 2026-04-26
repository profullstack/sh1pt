import { autoSetup } from './setup-helpers.js';

export interface SecurityScanRequest {
  path: string;
  kind?: 'dependencies' | 'container' | 'iac' | 'code';
}

export interface SecurityFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  packageName?: string;
  path?: string;
}

export interface SecurityProvider<Config = unknown> {
  id: string;
  label: string;
  cli: string;
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  scan(ctx: { secret(k: string): string | undefined; log(m: string): void }, req: SecurityScanRequest, config: Config): Promise<{ findings: SecurityFinding[] }>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineSecurityProvider<Config>(p: SecurityProvider<Config>): SecurityProvider<Config> {
  return autoSetup(p);
}

const securityRegistry = new Map<string, SecurityProvider<any>>();

export function registerSecurityProvider(p: SecurityProvider<any>): void {
  if (securityRegistry.has(p.id)) throw new Error(`Security provider already registered: ${p.id}`);
  securityRegistry.set(p.id, p);
}

export function getSecurityProvider(id: string): SecurityProvider<any> | undefined {
  return securityRegistry.get(id);
}

export function listSecurityProviders(): SecurityProvider<any>[] {
  return [...securityRegistry.values()];
}
