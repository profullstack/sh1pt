import { defineCloud, tokenSetup, type Instance, type Quote, type InstanceSpec } from '@profullstack/sh1pt-core';

// Vultr — VPS, bare metal, GPU, block/object storage. Clean REST API.
// API docs: https://www.vultr.com/api/
interface Config {
  apiKey?: string;           // VULTR_API_KEY secret
  defaultRegion?: string;    // ewr, lax, ams, nrt, etc.
}

const API = 'https://api.vultr.com/v2';

// ── Response shapes ──────────────────────────────────────────────

interface VultrAccountResponse {
  account: {
    name: string;
    email: string;
    balance: number;
    pending_charges: number;
  };
}

interface VultrPlan {
  id: string;
  vcpu_count: number;
  ram: number;             // MB
  disk: number;            // GB
  disk_type: string;
  bandwidth: number;       // GB
  monthly_cost: number;
  hourly_cost: number;
  type: string;            // vc2, vhf, vdc, vbm, vcg, etc.
  locations: string[];
  gpu_vram?: number;       // GB, for GPU plans
  gpu_type?: string;       // e.g. 'A100', 'H100'
}

interface VultrPlansResponse {
  plans: VultrPlan[];
  meta: { total: number };
}

interface VultrInstance {
  id: string;
  os: string;
  ram: number;
  disk: number;
  main_ip: string;
  vcpu_count: number;
  region: string;
  plan: string;
  date_created: string;
  status: string;          // pending, active, suspended, etc.
  power_status: string;    // running, stopped
  internal_ip: string;
  label: string;
  tag: string;
  tags: string[];
  features: string[];
  hostname: string;
}

interface VultrInstancesResponse {
  instances: VultrInstance[];
  meta: { total: number };
}

interface VultrBareMetal {
  id: string;
  os: string;
  ram: string;
  disk: string;
  main_ip: string;
  cpu_count: number;
  region: string;
  plan: string;
  date_created: string;
  status: string;
  label: string;
  tags: string[];
}

interface VultrBareMetalsResponse {
  bare_metals: VultrBareMetal[];
  meta: { total: number };
}

interface VultrBlockStorage {
  id: string;
  date_created: string;
  cost: number;
  status: string;
  size_gb: number;
  region: string;
  label: string;
}

interface VultrBlocksResponse {
  blocks: VultrBlockStorage[];
  meta: { total: number };
}

interface VultrDatabase {
  id: string;
  date_created: string;
  plan: string;
  plan_disk: number;
  plan_ram: number;
  plan_vcpu_count: number;
  region: string;
  status: string;
  label: string;
  db_engine: string;
}

interface VultrDatabasesResponse {
  databases: VultrDatabase[];
  meta: { total: number };
}

// ── Adapter ──────────────────────────────────────────────────────

export default defineCloud<Config>({
  id: 'cloud-vultr',
  label: 'Vultr (VPS, Bare Metal, GPU, Block Storage, Managed DB)',
  supports: ['cpu-vps', 'gpu', 'bare-metal', 'block-storage', 'object-storage', 'managed-db'],

  async connect(ctx, config) {
    if (!ctx.secret('VULTR_API_KEY')) throw new Error('VULTR_API_KEY not in vault — `sh1pt secret set VULTR_API_KEY`');
    ctx.log('vultr connect · verifying token...');
    const resp = await vultrRequest<VultrAccountResponse>(ctx, 'GET', '/account');
    ctx.log(`vultr connected · account=${resp.account.name} · email=${resp.account.email}`);
    return { accountId: resp.account.email || 'vultr-account' };
  },

  async quote(ctx, spec, config) {
    ctx.log(`vultr quote · kind=${spec.kind} · region=${spec.region ?? config.defaultRegion ?? 'ewr'}`);
    const region = spec.region ?? config.defaultRegion ?? 'ewr';
    const plans = await fetchPlans(ctx);

    const match = pickPlan(plans, spec, region);
    if (!match) {
      ctx.log(`vultr quote · no matching plan found for kind=${spec.kind} in ${region}`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'USD', provider: 'vultr', sku: 'none', spot: false };
    }

    return {
      hourly: match.hourly_cost,
      monthly: match.monthly_cost,
      currency: 'USD',
      provider: 'vultr',
      sku: match.id,
      spot: false,
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? 'ewr';
    const label = `sh1pt-${spec.kind}-${Date.now()}`;

    // Managed DB uses a different endpoint
    if (spec.kind === 'managed-db') {
      ctx.log(`vultr provision · managed database · region=${region}`);
      if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
      const db = await vultrRequest<VultrDatabase>(ctx, 'POST', '/databases', {
        region,
        plan: spec.cpu && spec.cpu >= 2 ? 'vultr-dbaas-2vcpu-4gb' : 'vultr-dbaas-1vcpu-1gb',
        label,
        database_engine: spec.image ?? 'pg',
        database_engine_version: '16',
      });
      return {
        id: db.id,
        kind: spec.kind,
        status: 'provisioning',
        createdAt: db.date_created,
        hourlyRate: 0,
        currency: 'USD',
        region,
      } satisfies Instance;
    }

    // Block storage
    if (spec.kind === 'block-storage') {
      ctx.log(`vultr provision · block storage · region=${region} · size=${spec.storage ?? 10}GB`);
      if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
      const block = await vultrRequest<{ block: VultrBlockStorage }>(ctx, 'POST', '/blocks', {
        region,
        size_gb: spec.storage ?? 10,
        label,
      });
      return {
        id: block.block.id,
        kind: spec.kind,
        status: 'provisioning',
        createdAt: block.block.date_created,
        hourlyRate: 0,
        currency: 'USD',
        region,
      } satisfies Instance;
    }

    // Bare metal
    if (spec.kind === 'bare-metal') {
      ctx.log(`vultr provision · bare metal · region=${region}`);
      if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
      const plans = await fetchPlans(ctx);
      const match = pickPlan(plans, spec, region);
      const planId = match?.id ?? defaultPlan(spec.kind);
      const bm = await vultrRequest<{ bare_metal: VultrBareMetal }>(ctx, 'POST', '/bare-metals', {
        region,
        plan: planId,
        label,
        os_id: 1743, // Ubuntu 24.04 x64
        ...(spec.sshKeyIds?.length ? { sshkey_id: spec.sshKeyIds } : {}),
        ...(spec.tags?.length ? { tags: spec.tags } : {}),
      });
      return bareMetalToInstance(bm.bare_metal);
    }

    // VPS / GPU (instance)
    const plans = await fetchPlans(ctx);
    const match = pickPlan(plans, spec, region);
    const planId = match?.id ?? defaultPlan(spec.kind);

    ctx.log(`vultr provision · instance · plan=${planId} · region=${region} · os_id=1743`);
    if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);

    const body: Record<string, unknown> = {
      region,
      plan: planId,
      label,
      os_id: 1743, // Ubuntu 24.04 x64
    };
    if (spec.sshKeyIds?.length) body.sshkey_id = spec.sshKeyIds;
    if (spec.tags?.length) body.tags = spec.tags;

    const result = await vultrRequest<{ instance: VultrInstance }>(ctx, 'POST', '/instances', body);
    return instanceToInstance(result.instance);
  },

  async list(ctx, config) {
    ctx.log('vultr list · fetching instances');
    const result = await vultrRequest<VultrInstancesResponse>(ctx, 'GET', '/instances');
    const instances = result.instances.map(instanceToInstance);

    // Also include bare metals
    try {
      const bmResult = await vultrRequest<VultrBareMetalsResponse>(ctx, 'GET', '/bare-metals');
      instances.push(...bmResult.bare_metals.map(bareMetalToInstance));
    } catch {
      ctx.log('vultr list · bare metals fetch failed, returning VPS only', 'warn');
    }

    return instances;
  },

  async destroy(ctx, instanceId, config) {
    ctx.log(`vultr destroy · ${instanceId}`);
    // Try instance delete first, then bare metal, then block storage, then database
    try {
      await vultrRequest<unknown>(ctx, 'DELETE', `/instances/${instanceId}`);
      return;
    } catch {
      // Not a regular instance, try bare metal
    }
    try {
      await vultrRequest<unknown>(ctx, 'DELETE', `/bare-metals/${instanceId}`);
      return;
    } catch {
      // Not bare metal, try block storage
    }
    try {
      await vultrRequest<unknown>(ctx, 'DELETE', `/blocks/${instanceId}`);
      return;
    } catch {
      // Not block storage, try managed database
    }
    await vultrRequest<unknown>(ctx, 'DELETE', `/databases/${instanceId}`);
  },

  async status(ctx, instanceId, config) {
    ctx.log(`vultr status · ${instanceId}`);
    // Try instance first
    try {
      const result = await vultrRequest<{ instance: VultrInstance }>(ctx, 'GET', `/instances/${instanceId}`);
      return instanceToInstance(result.instance);
    } catch {
      // Not a regular instance
    }
    try {
      const result = await vultrRequest<{ bare_metal: VultrBareMetal }>(ctx, 'GET', `/bare-metals/${instanceId}`);
      return bareMetalToInstance(result.bare_metal);
    } catch {
      // Not bare metal
    }
    try {
      const result = await vultrRequest<{ block: VultrBlockStorage }>(ctx, 'GET', `/blocks/${instanceId}`);
      return blockToInstance(result.block);
    } catch {
      // Not block storage, try managed database
    }
    const result = await vultrRequest<{ database: VultrDatabase }>(ctx, 'GET', `/databases/${instanceId}`);
    return databaseToInstance(result.database);
  },

  setup: tokenSetup<Config>({
    secretKey: 'VULTR_API_KEY',
    label: 'Vultr',
    vendorDocUrl: 'https://my.vultr.com/settings/#settingsapi',
    steps: [
      'Log in to my.vultr.com → Settings → API Keys',
      'Click "Add API Key" → enable full access (read + write)',
      'Whitelist your IP or leave open (not recommended for production)',
      'Copy the API key',
      'Run: sh1pt secret set VULTR_API_KEY <paste>',
    ],
    fields: [
      { key: 'defaultRegion', message: 'Default region (ewr, lax, ams, nrt, sgp, fra, etc.):' },
    ],
  }),
});

// ── Helpers ──────────────────────────────────────────────────────

function stubInstance(id: string, status: Instance['status'], kind: InstanceSpec['kind']): Instance {
  return {
    id,
    kind,
    status,
    createdAt: new Date().toISOString(),
    hourlyRate: 0,
    currency: 'USD',
  };
}

function instanceToInstance(i: VultrInstance): Instance {
  const statusMap: Record<string, Instance['status']> = {
    pending: 'provisioning',
    active: 'running',
    suspended: 'stopped',
    resizing: 'provisioning',
  };
  const powerStatusMap: Record<string, Instance['status']> = {
    running: 'running',
    stopped: 'stopped',
  };
  const effectiveStatus = i.status === 'active'
    ? (powerStatusMap[i.power_status] ?? 'running')
    : (statusMap[i.status] ?? 'provisioning');

  // Determine kind from plan prefix
  const planKind: Instance['kind'] = i.plan.startsWith('vcg') || i.plan.includes('gpu')
    ? 'gpu'
    : 'cpu-vps';

  return {
    id: i.id,
    kind: planKind,
    status: effectiveStatus,
    publicIp: i.main_ip && i.main_ip !== '0.0.0.0' ? i.main_ip : undefined,
    privateIp: i.internal_ip || undefined,
    createdAt: i.date_created,
    hourlyRate: 0, // Vultr doesn't return per-instance hourly in list
    currency: 'USD',
    sku: i.plan,
    region: i.region,
    tags: i.tags?.length ? i.tags : undefined,
  };
}

function bareMetalToInstance(bm: VultrBareMetal): Instance {
  const statusMap: Record<string, Instance['status']> = {
    pending: 'provisioning',
    active: 'running',
    suspended: 'stopped',
  };
  return {
    id: bm.id,
    kind: 'bare-metal',
    status: statusMap[bm.status] ?? 'provisioning',
    publicIp: bm.main_ip && bm.main_ip !== '0.0.0.0' ? bm.main_ip : undefined,
    createdAt: bm.date_created,
    hourlyRate: 0,
    currency: 'USD',
    sku: bm.plan,
    region: bm.region,
    tags: bm.tags?.length ? bm.tags : undefined,
  };
}

function blockToInstance(block: VultrBlockStorage): Instance {
  const statusMap: Record<string, Instance['status']> = {
    pending: 'provisioning',
    active: 'running',
  };
  return {
    id: block.id,
    kind: 'block-storage',
    status: statusMap[block.status] ?? 'provisioning',
    createdAt: block.date_created,
    hourlyRate: 0,
    currency: 'USD',
    region: block.region,
  };
}

function databaseToInstance(db: VultrDatabase): Instance {
  const statusMap: Record<string, Instance['status']> = {
    provisioning: 'provisioning',
    running: 'running',
    stopped: 'stopped',
  };
  return {
    id: db.id,
    kind: 'managed-db',
    status: statusMap[db.status] ?? 'provisioning',
    createdAt: db.date_created,
    hourlyRate: 0,
    currency: 'USD',
    sku: db.plan,
    region: db.region,
  };
}

function defaultPlan(kind: InstanceSpec['kind']): string {
  switch (kind) {
    case 'gpu': return 'vcg-a100-80gb-1';       // A100 80GB GPU
    case 'bare-metal': return 'vbm-4c-32gb';     // 4 vCPU bare metal
    case 'cpu-vps': return 'vc2-2c-4gb';         // 2 vCPU shared VPS
    default: return 'vc2-1c-1gb';                // smallest VPS
  }
}

function pickPlan(plans: VultrPlan[], spec: InstanceSpec, region: string): VultrPlan | null {
  // Filter by region availability
  let candidates = plans.filter(p =>
    p.locations.includes(region) &&
    p.monthly_cost > 0
  );

  // GPU filter — vcg plans
  if (spec.kind === 'gpu') {
    candidates = candidates.filter(p =>
      p.type === 'vcg' || p.id.includes('gpu') || (p.gpu_vram && p.gpu_vram > 0)
    );
  } else if (spec.kind === 'cpu-vps') {
    candidates = candidates.filter(p =>
      p.type !== 'vcg' && !p.id.includes('gpu') && (!p.gpu_vram || p.gpu_vram === 0)
    );
  } else if (spec.kind === 'bare-metal') {
    candidates = candidates.filter(p =>
      p.type === 'vbm' || p.id.startsWith('vbm-')
    );
  }

  // Spec-based filtering
  if (spec.cpu) candidates = candidates.filter(p => p.vcpu_count >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter(p => p.ram >= spec.memory! * 1024);
  if (spec.storage) candidates = candidates.filter(p => p.disk >= spec.storage!);

  // Price guardrail
  if (spec.maxHourlyPrice) {
    candidates = candidates.filter(p => p.hourly_cost <= spec.maxHourlyPrice!);
  }

  // Cheapest first
  candidates.sort((a, b) => a.monthly_cost - b.monthly_cost);
  return candidates[0] ?? null;
}

let plansCache: VultrPlan[] | null = null;

async function fetchPlans(ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void }): Promise<VultrPlan[]> {
  if (plansCache) return plansCache;
  const result = await vultrRequest<VultrPlansResponse>(ctx, 'GET', '/plans');
  plansCache = result.plans;
  return plansCache;
}

async function vultrRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = ctx.secret('VULTR_API_KEY');
  if (!token) throw new Error('VULTR_API_KEY not in vault');

  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(stripUndefined(body));
  }

  const response = await fetch(`${API}${path}`, opts);

  if (method === 'DELETE' && response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const errMsg = extractErrorMessage(data, response.statusText);
    throw new Error(`Vultr ${method} ${path} failed: ${response.status} ${errMsg}`);
  }

  return data as T;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  return fallback;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  );
}
