import { defineCloud, tokenSetup, type Instance, type Quote, type InstanceSpec } from '@profullstack/sh1pt-core';

// Hetzner Cloud — cheapest per-core pricing of any major EU host.
// Includes Cloud Servers (VPS), dedicated vCPU (CCX), Volumes (block storage),
// Load Balancers, Firewalls, Floating IPs, and DNS.
// Also has the `hcloud` CLI tool for easy management.
// API docs: https://docs.hetzner.cloud/reference/cloud
interface Config {
  apiToken?: string;          // HCLOUD_TOKEN secret
  defaultLocation?: string;   // fsn1, nbg1, hel1, ash, hil, sin
}

const API = 'https://api.hetzner.cloud/v1';

// ── Response shapes ──────────────────────────────────────────────

interface HcloudAccount {
  account: {
    id: number;
    name: string;
    email: string;
    balance: string;
    limit: number;
  };
}

interface HcloudServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;            // GB
  disk: number;               // GB
  deprecated: boolean;
  prices: Array<{
    location: string;
    price_hourly: { net: string; gross: string };
    price_monthly: { net: string; gross: string };
  }>;
  storage_type: string;       // local, network
  cpu_type: string;           // shared, dedicated
  architecture: string;       // x86, arm
  included_traffic: number;
}

interface HcloudServerTypesResponse {
  server_types: HcloudServerType[];
  meta: { pagination: { page: number; per_page: number; previous_page: number; next_page: number; last_page: number; total_entries: number } };
}

interface HcloudPublicNet {
  ipv4?: { ip: string };
  ipv6?: { ip: string };
}

interface HcloudServer {
  id: number;
  name: string;
  status: string;             // running, initializing, starting, stopping, off, deleting, rebuilding, migrating, unknown
  public_net: HcloudPublicNet;
  private_net: Array<{ network: number; ip: string }>;
  server_type: { id: number; name: string; cores: number; memory: number; disk: number; cpu_type: string };
  datacenter: { id: number; name: string; location: { id: number; name: string; description: string } };
  created: string;
  labels: Record<string, string>;
}

interface HcloudServersResponse {
  servers: HcloudServer[];
  meta: { pagination: { page: number; per_page: number; previous_page: number; next_page: number; last_page: number; total_entries: number } };
}

interface HcloudCreateServerResponse {
  server: HcloudServer;
  action: { id: number; status: string };
}

interface HcloudVolume {
  id: number;
  name: string;
  size: number;               // GB
  status: string;             // available, creating
  location: { id: number; name: string; description: string };
  server: number | null;
  created: string;
  format: string | null;
  labels: Record<string, string>;
  price_per_month: string;
}

interface HcloudVolumeResponse {
  volume: HcloudVolume;
  action: { id: number; status: string };
}

interface HcloudVolumesResponse {
  volumes: HcloudVolume[];
  meta: { pagination: { page: number; per_page: number; previous_page: number; next_page: number; last_page: number; total_entries: number } };
}

// ── Adapter ──────────────────────────────────────────────────────

export default defineCloud<Config>({
  id: 'cloud-hetzner',
  label: 'Hetzner Cloud (VPS, Dedicated vCPU, Volumes, Load Balancers)',
  supports: ['cpu-vps', 'bare-metal', 'block-storage', 'object-storage'],

  async connect(ctx, config) {
    if (!ctx.secret('HCLOUD_TOKEN')) throw new Error('HCLOUD_TOKEN not in vault — `sh1pt secret set HCLOUD_TOKEN`');
    ctx.log('hcloud connect · verifying token...');
    const resp = await hcloudRequest<HcloudAccount>(ctx, 'GET', '/account');
    ctx.log(`hcloud connected · account=${resp.account.name} · email=${resp.account.email} · balance=${resp.account.balance}€`);
    return { accountId: String(resp.account.id) };
  },

  async quote(ctx, spec, config) {
    ctx.log(`hcloud quote · kind=${spec.kind} · location=${spec.region ?? config.defaultLocation ?? 'fsn1'}`);
    const location = spec.region ?? config.defaultLocation ?? 'fsn1';
    let serverTypes: HcloudServerType[];
    try {
      serverTypes = await fetchServerTypes(ctx);
    } catch (e) {
      ctx.log(`hcloud quote · could not fetch server types (${e instanceof Error ? e.message : String(e)}) — returning stub`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'EUR', provider: 'hetzner', sku: 'unknown', spot: false };
    }

    const match = pickServerType(serverTypes, spec, location);
    if (!match) {
      ctx.log(`hcloud quote · no matching server type found for kind=${spec.kind} in ${location}`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'EUR', provider: 'hetzner', sku: 'none', spot: false };
    }

    const priceForLocation = match.prices.find(p => p.location === location) ?? match.prices[0];
    const hourly = parseFloat(priceForLocation?.price_hourly?.net ?? '0');
    const monthly = parseFloat(priceForLocation?.price_monthly?.net ?? '0');

    return {
      hourly,
      monthly,
      currency: 'EUR',
      provider: 'hetzner',
      sku: match.name,
      spot: false,
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    const location = spec.region ?? config.defaultLocation ?? 'fsn1';
    const name = `sh1pt-${spec.kind}-${Date.now()}`;

    // Short-circuit dryRun before any network calls (the server path
    // below calls fetchServerTypes unconditionally).
    if (ctx.dryRun) return { ...stubInstance('dry-run', 'provisioning', spec.kind), region: location };

    // Block storage (volume)
    if (spec.kind === 'block-storage') {
      ctx.log(`hcloud provision · volume · location=${location} · size=${spec.storage ?? 10}GB`);
      if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);
      const vol = await hcloudRequest<HcloudVolumeResponse>(ctx, 'POST', '/volumes', {
        name,
        size: spec.storage ?? 10,
        location,
        format: 'ext4',
      });
      return {
        id: String(vol.volume.id),
        kind: spec.kind,
        status: 'provisioning',
        createdAt: vol.volume.created,
        hourlyRate: parseFloat(vol.volume.price_per_month) / 730,
        currency: 'EUR',
        region: vol.volume.location.name,
      } satisfies Instance;
    }

    // Cloud Server (VPS / Dedicated vCPU / bare-metal)
    const serverTypes = await fetchServerTypes(ctx);
    const match = pickServerType(serverTypes, spec, location);
    const serverTypeName = match?.name ?? defaultServerType(spec.kind);

    ctx.log(`hcloud provision · server · type=${serverTypeName} · location=${location} · image=${spec.image ?? 'ubuntu-24.04'}`);
    if (ctx.dryRun) return stubInstance('dry-run', 'provisioning', spec.kind);

    const body: Record<string, unknown> = {
      name,
      server_type: serverTypeName,
      location,
      image: spec.image ?? 'ubuntu-24.04',
      start_after_create: true,
    };

    if (spec.sshKeyIds?.length) {
      body.ssh_keys = spec.sshKeyIds;
    }

    if (spec.tags?.length) {
      body.labels = Object.fromEntries(
        spec.tags.map((t, i) => [`tag${i}`, t]),
      );
    }

    const result = await hcloudRequest<HcloudCreateServerResponse>(ctx, 'POST', '/servers', body);
    return serverToInstance(result.server);
  },

  async list(ctx, config) {
    ctx.log('hcloud list · fetching servers');
    const result = await hcloudRequest<HcloudServersResponse>(ctx, 'GET', '/servers');
    const instances = result.servers.map(serverToInstance);

    // Also include volumes (block storage)
    try {
      const volResult = await hcloudRequest<HcloudVolumesResponse>(ctx, 'GET', '/volumes');
      instances.push(...volResult.volumes.map(volumeToInstance));
    } catch {
      ctx.log('hcloud list · volumes fetch failed, returning servers only', 'warn');
    }

    return instances;
  },

  async destroy(ctx, instanceId, config) {
    ctx.log(`hcloud destroy · ${instanceId}`);
    // Try volume delete first (numeric IDs can overlap with server IDs)
    try {
      await hcloudRequest<unknown>(ctx, 'DELETE', `/volumes/${instanceId}`);
      return;
    } catch {
      // Not a volume, try server
    }
    await hcloudRequest<unknown>(ctx, 'DELETE', `/servers/${instanceId}`);
  },

  async status(ctx, instanceId, config) {
    ctx.log(`hcloud status · ${instanceId}`);
    // Try server first
    try {
      const result = await hcloudRequest<{ server: HcloudServer }>(ctx, 'GET', `/servers/${instanceId}`);
      return serverToInstance(result.server);
    } catch {
      // Not a server, try volume
    }
    const result = await hcloudRequest<{ volume: HcloudVolume }>(ctx, 'GET', `/volumes/${instanceId}`);
    return volumeToInstance(result.volume);
  },

  setup: tokenSetup<Config>({
    secretKey: 'HCLOUD_TOKEN',
    label: 'Hetzner Cloud',
    vendorDocUrl: 'https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/',
    steps: [
      'Log in to console.hetzner.cloud → Security → API Tokens',
      'Create a new token with Read & Write permissions',
      'Copy the token (shown only once!)',
      'Run: sh1pt secret set HCLOUD_TOKEN <paste>',
      'Tip: You can also use the `hcloud` CLI — it uses the same HCLOUD_TOKEN env var',
    ],
    fields: [
      { key: 'defaultLocation', message: 'Default location (fsn1, nbg1, hel1, ash, hil, sin):' },
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
    currency: 'EUR',
  };
}

function serverToInstance(s: HcloudServer): Instance {
  const statusMap: Record<string, Instance['status']> = {
    running: 'running',
    initializing: 'provisioning',
    starting: 'provisioning',
    stopping: 'provisioning',
    off: 'stopped',
    deleting: 'destroyed',
    rebuilding: 'provisioning',
    migrating: 'provisioning',
    unknown: 'provisioning',
  };

  const publicIp = s.public_net?.ipv4?.ip;
  const privateIp = s.private_net?.[0]?.ip;

  // Determine kind from server type name and cpu_type
  const isDedicated = s.server_type?.cpu_type === 'dedicated' || s.server_type?.name?.startsWith('ccx');
  const kind: Instance['kind'] = isDedicated ? 'bare-metal' : 'cpu-vps';

  return {
    id: String(s.id),
    kind,
    status: statusMap[s.status] ?? 'provisioning',
    publicIp,
    privateIp,
    createdAt: s.created,
    hourlyRate: 0, // Not returned per-server; fetch from server types if needed
    currency: 'EUR',
    sku: s.server_type?.name,
    region: s.datacenter?.location?.name,
    tags: s.labels ? Object.values(s.labels) : undefined,
  };
}

function volumeToInstance(v: HcloudVolume): Instance {
  const statusMap: Record<string, Instance['status']> = {
    available: 'running',
    creating: 'provisioning',
  };
  return {
    id: String(v.id),
    kind: 'block-storage',
    status: statusMap[v.status] ?? 'provisioning',
    createdAt: v.created,
    hourlyRate: parseFloat(v.price_per_month) / 730,
    currency: 'EUR',
    region: v.location.name,
  };
}

function defaultServerType(kind: InstanceSpec['kind']): string {
  switch (kind) {
    case 'bare-metal': return 'ccx13';          // Dedicated vCPU: 2 cores, 8GB RAM
    case 'cpu-vps': return 'cx22';              // Shared vCPU: 2 cores, 4GB RAM
    default: return 'cx22';                     // Smallest reasonable VPS
  }
}

function pickServerType(serverTypes: HcloudServerType[], spec: InstanceSpec, location: string): HcloudServerType | null {
  // Filter by location availability and non-deprecated
  let candidates = serverTypes.filter(st =>
    !st.deprecated &&
    st.prices.some(p => p.location === location) &&
    parseFloat(st.prices.find(p => p.location === location)?.price_monthly?.net ?? '0') > 0
  );

  // Kind-based filtering
  if (spec.kind === 'bare-metal') {
    // Dedicated vCPU plans (CCX series) or cpu_type === 'dedicated'
    candidates = candidates.filter(st =>
      st.cpu_type === 'dedicated' || st.name.startsWith('ccx')
    );
  } else if (spec.kind === 'cpu-vps') {
    // Shared vCPU plans
    candidates = candidates.filter(st =>
      st.cpu_type === 'shared' && !st.name.startsWith('ccx')
    );
  }

  // Spec-based filtering
  if (spec.cpu) candidates = candidates.filter(st => st.cores >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter(st => st.memory >= spec.memory!);
  if (spec.storage) candidates = candidates.filter(st => st.disk >= spec.storage!);

  // Price guardrail
  if (spec.maxHourlyPrice) {
    candidates = candidates.filter(st => {
      const priceForLocation = st.prices.find(p => p.location === location);
      return priceForLocation ? parseFloat(priceForLocation.price_hourly.net) <= spec.maxHourlyPrice! : false;
    });
  }

  // Cheapest first (by monthly net price for target location)
  candidates.sort((a, b) => {
    const aPrice = parseFloat(a.prices.find(p => p.location === location)?.price_monthly?.net ?? '0');
    const bPrice = parseFloat(b.prices.find(p => p.location === location)?.price_monthly?.net ?? '0');
    return aPrice - bPrice;
  });

  return candidates[0] ?? null;
}

let serverTypesCache: HcloudServerType[] | null = null;

async function fetchServerTypes(ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void }): Promise<HcloudServerType[]> {
  if (serverTypesCache) return serverTypesCache;
  const result = await hcloudRequest<HcloudServerTypesResponse>(ctx, 'GET', '/server_types?per_page=200');
  serverTypesCache = result.server_types;
  return serverTypesCache;
}

async function hcloudRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = ctx.secret('HCLOUD_TOKEN');
  if (!token) throw new Error('HCLOUD_TOKEN not in vault');

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

  if (method === 'DELETE' && (response.status === 204 || response.status === 200)) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const errMsg = extractErrorMessage(data, response.statusText);
    throw new Error(`Hetzner ${method} ${path} failed: ${response.status} ${errMsg}`);
  }

  return data as T;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'error' in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    if (typeof err === 'string') return err;
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
