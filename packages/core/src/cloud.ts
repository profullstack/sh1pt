// Raw compute provisioning — VPS, GPU instances, bare metal. Different
// abstraction from Target adapters: you OWN the resource (and the bill)
// until you destroy it. `sh1pt deploy` drives this; `sh1pt ship` does not.

export type InstanceKind = 'cpu-vps' | 'gpu' | 'bare-metal' | 'managed-db' | 'block-storage' | 'object-storage';

export interface GpuSpec {
  model: string;                         // e.g. 'A100-40GB', 'H100', 'RTX-4090'
  count: number;
  vram?: number;                         // GB, if known
}

export interface InstanceSpec {
  kind: InstanceKind;
  cpu?: number;                          // vCPU count
  memory?: number;                       // GB
  storage?: number;                      // GB
  gpu?: GpuSpec;
  region?: string;                       // provider-specific region id
  image?: string;                        // OS image / container / template
  sshKeyIds?: string[];
  tags?: string[];
  // accept interruptible / spot instances for lower price (provider-specific)
  spotOk?: boolean;
  // maximum the user is willing to pay in their currency/hour. If a quote
  // exceeds this, provisioning aborts — a critical guardrail given GPU
  // prices ($3–8/hr).
  maxHourlyPrice?: number;
}

export interface Quote {
  hourly: number;
  monthly: number;                       // hourly * 730 convention
  currency: string;
  provider: string;
  sku: string;                           // provider's internal plan id
  spot: boolean;
  availabilityZone?: string;
}

export interface Instance {
  id: string;                            // provider-native instance id
  kind: InstanceKind;
  status: 'provisioning' | 'running' | 'stopped' | 'failed' | 'destroyed';
  publicIp?: string;
  privateIp?: string;
  createdAt: string;                     // ISO
  hourlyRate: number;
  currency: string;
  sku?: string;
  region?: string;
  tags?: string[];
}

export interface ProvisionContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  dryRun: boolean;
}

export interface CloudConnectContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

export interface CloudProvider<Config = unknown> {
  id: string;                            // e.g. 'cloud-runpod'
  label: string;
  supports: InstanceKind[];
  connect(ctx: CloudConnectContext, config: Config): Promise<{ accountId: string }>;
  // Return a price quote BEFORE provisioning. Never skip this step for
  // GPUs or bare metal — an A100 rack left running overnight is a bad day.
  quote(ctx: CloudConnectContext, spec: InstanceSpec, config: Config): Promise<Quote>;
  provision(ctx: ProvisionContext, spec: InstanceSpec, config: Config): Promise<Instance>;
  list(ctx: CloudConnectContext, config: Config): Promise<Instance[]>;
  destroy(ctx: ProvisionContext, instanceId: string, config: Config): Promise<void>;
  status(ctx: CloudConnectContext, instanceId: string, config: Config): Promise<Instance>;
}

export function defineCloud<Config>(p: CloudProvider<Config>): CloudProvider<Config> {
  return p;
}

const cloudRegistry = new Map<string, CloudProvider<any>>();

export function registerCloudProvider(p: CloudProvider<any>): void {
  if (cloudRegistry.has(p.id)) throw new Error(`Cloud provider already registered: ${p.id}`);
  cloudRegistry.set(p.id, p);
}

export function getCloudProvider(id: string): CloudProvider<any> | undefined {
  return cloudRegistry.get(id);
}

export function listCloudProviders(): CloudProvider<any>[] {
  return [...cloudRegistry.values()];
}
