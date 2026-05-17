import { defineCloud, tokenSetup, type Instance, type Quote, type InstanceSpec } from '@profullstack/sh1pt-core';

// DigitalOcean — great API, predictable pricing. Includes Droplets (VPS),
// GPU Droplets (H100), managed Postgres/Mongo/Redis, Spaces (S3-compat),
// and App Platform (PaaS).
// API docs: https://docs.digitalocean.com/reference/api/api-reference/
interface Config {
  apiToken?: string;        // DO_API_TOKEN secret
  projectId?: string;
  defaultRegion?: string;   // nyc3, ams3, sfo3, sgp1, lon1, fra1, tor1, blr1, syd1
}

const API = 'https://api.digitalocean.com/v2';

// ── Response shapes ──────────────────────────────────────────────

interface DoAccountResponse {
  account: {
    uuid: string;
    email: string;
    droplet_limit: number;
    status: string;
  };
}

interface DoSize {
  slug: string;
  memory: number;        // MB
  vcpus: number;
  disk: number;          // GB
  transfer: number;      // TB
  price_monthly: number;
  price_hourly: number;
  regions: string[];
  available: boolean;
  gpu?: boolean;
}

interface DoSizesResponse {
  sizes: DoSize[];
}

interface DoDroplet {
  id: number;
  name: string;
  status: string;
  memory: number;
  vcpus: number;
  disk: number;
  region: { slug: string; name: string };
  networks: {
    v4: Array<{ ip_address: string; type: string }>;
    v6: Array<{ ip_address: string; type: string }>;
  };
  tags: string[];
  created_at: string;
  size: { slug: string; price_hourly: number };
}

interface DoDropletsResponse {
  droplets: DoDroplet[];
}

interface DoDropletActionResponse {
  action: { id: number; status: string };
}

interface DoDatabaseResponse {
  database: {
    id: string;
    name: string;
    engine: string;
    status: string;
    created_at: string;
    region: string;
  };
}

// ── Adapter ──────────────────────────────────────────────────────

export default defineCloud<Config>({
  id: 'cloud-digitalocean',
  label: 'DigitalOcean (VPS, GPU Droplets, Managed DB, Spaces)',
  supports: ['cpu-vps', 'gpu', 'managed-db', 'block-storage', 'object-storage'],

  async connect(ctx, config) {
    if (!ctx.secret('DO_API_TOKEN')) throw new Error('DO_API_TOKEN not in vault — `sh1pt secret set DO_API_TOKEN`');
    ctx.log(`do connect · verifying token...`);
    const resp = await doRequest<DoAccountResponse>(ctx, 'GET', '/account');
    ctx.log(`do connected · account=${resp.account.uuid} · droplet_limit=${resp.account.droplet_limit}`);
    return { accountId: resp.account.uuid };
  },

  async quote(ctx, spec, config) {
    ctx.log(`do quote · kind=${spec.kind} · region=${spec.region ?? config.defaultRegion ?? 'nyc3'}`);
    const region = spec.region ?? config.defaultRegion ?? 'nyc3';
    let sizes: DoSize[];
    try {
      sizes = await fetchSizes(ctx);
    } catch (e) {
      ctx.log(`do quote · could not fetch sizes (${e instanceof Error ? e.message : String(e)}) — returning stub`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'USD', provider: 'digitalocean', sku: 'unknown', spot: false };
    }

    const match = pickSize(sizes, spec, region);
    if (!match) {
      ctx.log(`do quote · no matching size found for kind=${spec.kind} in ${region}`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'USD', provider: 'digitalocean', sku: 'none', spot: false };
    }

    return {
      hourly: match.price_hourly,
      monthly: match.price_monthly,
      currency: 'USD',
      provider: 'digitalocean',
      sku: match.slug,
      spot: false,
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? 'nyc3';
    const name = `sh1pt-${spec.kind}-${Date.now()}`;

    // Short-circuit dryRun before any network calls (the droplet path
    // below calls fetchSizes unconditionally).
    if (ctx.dryRun) return { ...stubInstance('dry-run', 'provisioning', spec.kind), region };

    // Managed DB uses a different endpoint
    if (spec.kind === 'managed-db') {
      ctx.log(`do provision · managed database · region=${region}`);
      const db = await doRequest<DoDatabaseResponse>(ctx, 'POST', '/databases', {
        name,
        engine: spec.image ?? 'pg',
        version: '16',
        region,
        size: spec.cpu && spec.cpu >= 2 ? 'db-s-2vcpu-4gb' : 'db-s-1vcpu-1gb',
        num_nodes: 1,
      });
      return {
        id: db.database.id,
        kind: spec.kind,
        status: 'provisioning',
        createdAt: db.database.created_at,
        hourlyRate: 0,
        currency: 'USD',
        region,
      } satisfies Instance;
    }

    // Block storage (volume)
    if (spec.kind === 'block-storage') {
      ctx.log(`do provision · volume · region=${region} · size=${spec.storage ?? 10}GB`);
      if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
      const vol = await doRequest<{ volume: { id: string; created_at: string } }>(ctx, 'POST', '/volumes', {
        name,
        region,
        size_gigabytes: spec.storage ?? 10,
        filesystem_type: 'ext4',
      });
      return {
        id: vol.volume.id,
        kind: spec.kind,
        status: 'provisioning',
        createdAt: vol.volume.created_at,
        hourlyRate: 0,
        currency: 'USD',
        region,
      } satisfies Instance;
    }

    // Droplet (VPS / GPU)
    const sizes = await fetchSizes(ctx);
    const match = pickSize(sizes, spec, region);
    const sizeSlug = match?.slug ?? defaultSize(spec.kind);

    ctx.log(`do provision · droplet · size=${sizeSlug} · region=${region} · image=${spec.image ?? 'ubuntu-24-04-x64'}`);
    if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);

    const body: Record<string, unknown> = {
      name,
      region,
      size: sizeSlug,
      image: spec.image ?? 'ubuntu-24-04-x64',
      tags: spec.tags ?? ['sh1pt'],
    };
    if (spec.sshKeyIds?.length) body.ssh_keys = spec.sshKeyIds;

    const result = await doRequest<{ droplet: DoDroplet }>(ctx, 'POST', '/droplets', body);
    const d = result.droplet;
    return dropletToInstance(d);
  },

  async list(ctx, config) {
    ctx.log('do list · fetching droplets');
    const result = await doRequest<DoDropletsResponse>(ctx, 'GET', '/droplets');
    return result.droplets.map(dropletToInstance);
  },

  async destroy(ctx, instanceId, config) {
    ctx.log(`do destroy · ${instanceId}`);
    if (instanceId.startsWith('vol-') || instanceId.length > 15) {
      // Could be a volume or database — try volume first
      try {
        await doRequest<unknown>(ctx, 'DELETE', `/volumes/${instanceId}`);
        return;
      } catch {
        // Fall through to droplet delete
      }
    }
    await doRequest<DoDropletActionResponse>(ctx, 'DELETE', `/droplets/${instanceId}`);
  },

  async status(ctx, instanceId, config) {
    ctx.log(`do status · ${instanceId}`);
    const result = await doRequest<{ droplet: DoDroplet }>(ctx, 'GET', `/droplets/${instanceId}`);
    return dropletToInstance(result.droplet);
  },

  setup: tokenSetup<Config>({
    secretKey: 'DO_API_TOKEN',
    label: 'DigitalOcean',
    vendorDocUrl: 'https://docs.digitalocean.com/reference/api/create-personal-access-token/',
    steps: [
      'Log in to cloud.digitalocean.com → Settings → API → Tokens/Keys',
      'Generate New Token → select Write scope (needed for provisioning)',
      'Copy the token (shown only once)',
      'Run: sh1pt secret set DO_API_TOKEN <paste>',
    ],
    fields: [
      { key: 'projectId', message: 'DigitalOcean Project ID (optional — organizes resources):' },
      { key: 'defaultRegion', message: 'Default region (nyc3, ams3, sfo3, etc.):' },
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

function dropletToInstance(d: DoDroplet): Instance {
  const publicIp = d.networks?.v4?.find(n => n.type === 'public')?.ip_address;
  const privateIp = d.networks?.v4?.find(n => n.type === 'private')?.ip_address;
  const statusMap: Record<string, Instance['status']> = {
    new: 'provisioning',
    active: 'running',
    off: 'stopped',
    archive: 'destroyed',
  };
  return {
    id: String(d.id),
    kind: d.size?.slug?.includes('gpu') ? 'gpu' : 'cpu-vps',
    status: statusMap[d.status] ?? 'provisioning',
    publicIp,
    privateIp,
    createdAt: d.created_at,
    hourlyRate: d.size?.price_hourly ?? 0,
    currency: 'USD',
    sku: d.size?.slug,
    region: d.region?.slug,
    tags: d.tags,
  };
}

function defaultSize(kind: InstanceSpec['kind']): string {
  switch (kind) {
    case 'gpu': return 'gpu-h100x1-80gb';
    case 'bare-metal': return 'c-4';  // dedicated CPU
    default: return 's-2vcpu-4gb';    // shared CPU VPS
  }
}

function pickSize(sizes: DoSize[], spec: InstanceSpec, region: string): DoSize | null {
  // Filter by region availability and kind
  let candidates = sizes.filter(s =>
    s.available &&
    s.regions.includes(region) &&
    s.price_monthly > 0
  );

  // GPU filter
  if (spec.kind === 'gpu') {
    candidates = candidates.filter(s => s.gpu || s.slug.includes('gpu'));
  } else if (spec.kind === 'cpu-vps') {
    candidates = candidates.filter(s => !s.gpu && !s.slug.includes('gpu'));
  }

  // Spec-based filtering
  if (spec.cpu) candidates = candidates.filter(s => s.vcpus >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter(s => s.memory >= spec.memory! * 1024);
  if (spec.storage) candidates = candidates.filter(s => s.disk >= spec.storage!);

  // Price guardrail
  if (spec.maxHourlyPrice) {
    candidates = candidates.filter(s => s.price_hourly <= spec.maxHourlyPrice!);
  }

  // Spot preference
  if (spec.spotOk) {
    const spotCandidates = candidates.filter(s => s.slug.includes('-spot-'));
    if (spotCandidates.length) candidates = spotCandidates;
  }

  // Cheapest first
  candidates.sort((a, b) => a.price_monthly - b.price_monthly);
  return candidates[0] ?? null;
}

let sizesCache: DoSize[] | null = null;

async function fetchSizes(ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void }): Promise<DoSize[]> {
  if (sizesCache) return sizesCache;
  const result = await doRequest<DoSizesResponse>(ctx, 'GET', '/sizes?per_page=200');
  sizesCache = result.sizes;
  return sizesCache;
}

async function doRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = ctx.secret('DO_API_TOKEN');
  if (!token) throw new Error('DO_API_TOKEN not in vault');

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
    throw new Error(`DigitalOcean ${method} ${path} failed: ${response.status} ${errMsg}`);
  }

  return data as T;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  if (typeof data === 'object' && data && 'id' in data && typeof (data as { id?: unknown }).id === 'string') {
    return (data as { id: string; message?: string }).message ?? (data as { id: string }).id;
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
