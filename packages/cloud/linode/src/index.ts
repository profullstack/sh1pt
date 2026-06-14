import { defineCloud, tokenSetup, type Instance, type InstanceSpec, type Quote } from '@profullstack/sh1pt-core';

// Linode, now Akamai Cloud Computing. API v4 exposes public type
// pricing and authenticated instance/volume management endpoints.
interface Config {
  defaultRegion?: string;
  authorizedKeys?: string[];
  authorizedUsers?: string[];
  rootPassSecret?: string;
}

const API = 'https://api.linode.com/v4';
const DEFAULT_REGION = 'us-east';
const DEFAULT_IMAGE = 'linode/ubuntu24.04';
const DEFAULT_ROOT_PASS_SECRET = 'LINODE_ROOT_PASS';
const VOLUME_MONTHLY_PER_GB = 0.10;

type RegionAvailability =
  | Record<string, string | undefined>
  | Array<string | { region?: string; availability?: string; status?: string }>;

interface LinodeAccount {
  email?: string;
  euuid?: string;
  company?: string;
  first_name?: string;
  last_name?: string;
  balance?: number;
  balance_uninvoiced?: number;
}

interface LinodeType {
  id: string;
  label: string;
  price: {
    hourly: number;
    monthly: number;
  };
  vcpus: number;
  memory: number;
  disk: number;
  transfer: number;
  gpus?: number;
  class?: string;
  region_availability?: RegionAvailability;
}

interface LinodeTypesResponse {
  data: LinodeType[];
}

interface LinodePage<T> {
  data: T[];
  page?: number;
  pages?: number;
}

interface LinodeInstance {
  id: number;
  label: string;
  status: string;
  type: string;
  ipv4?: string[];
  ipv6?: string;
  region: string;
  image?: string;
  created: string;
  specs?: {
    gpus?: number;
  };
  tags?: string[];
}

interface LinodeVolume {
  id: number;
  label: string;
  status: string;
  size: number;
  region: string;
  linode_id: number | null;
  created: string;
  tags?: string[];
}

export default defineCloud<Config>({
  id: 'cloud-linode',
  label: 'Linode / Akamai Cloud (VPS, GPU, Dedicated CPU, Block Storage)',
  supports: ['cpu-vps', 'gpu', 'bare-metal', 'block-storage'],

  async connect(ctx) {
    if (!ctx.secret('LINODE_API_TOKEN')) throw new Error('LINODE_API_TOKEN not in vault - `sh1pt secret set LINODE_API_TOKEN`');
    ctx.log('linode connect - verifying token');
    const account = await linodeRequest<LinodeAccount>(ctx, 'GET', '/account');
    const accountId = account.euuid ?? account.email ?? account.company ?? 'linode-account';
    ctx.log(`linode connected - account=${accountId}`);
    return { accountId };
  },

  async quote(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? DEFAULT_REGION;
    ctx.log(`linode quote - kind=${spec.kind} region=${region}`);

    if (spec.kind === 'block-storage') {
      const monthly = (spec.storage ?? 10) * VOLUME_MONTHLY_PER_GB;
      return {
        hourly: volumeHourlyRate(spec.storage ?? 10),
        monthly,
        currency: 'USD',
        provider: 'linode',
        sku: 'block-storage',
        spot: false,
      } satisfies Quote;
    }

    const types = await fetchTypes(ctx);
    const match = pickType(types, spec, region);
    if (!match) {
      ctx.log(`linode quote - no matching type for kind=${spec.kind} in ${region}`, 'warn');
      throw new Error(`linode: no matching type for kind=${spec.kind} in ${region}`);
    }

    return {
      hourly: match.price.hourly,
      monthly: match.price.monthly,
      currency: 'USD',
      provider: 'linode',
      sku: match.id,
      spot: false,
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? DEFAULT_REGION;
    const label = resourceLabel(spec.kind);

    if (spec.kind === 'block-storage') {
      const hourly = volumeHourlyRate(spec.storage ?? 10);
      if (spec.maxHourlyPrice !== undefined && hourly > spec.maxHourlyPrice) {
        throw new Error(`linode: block-storage hourly price $${hourly} exceeds maxHourlyPrice $${spec.maxHourlyPrice}`);
      }
      if (ctx.dryRun) {
        return { ...stubInstance('dry-run', 'provisioning', spec.kind), region, hourlyRate: hourly };
      }
      ctx.log(`linode provision - volume region=${region} size=${spec.storage ?? 10}GB`);
      const volume = await linodeRequest<LinodeVolume>(ctx, 'POST', '/volumes', {
        label,
        region,
        size: spec.storage ?? 10,
        tags: spec.tags,
      });
      return volumeToInstance(volume);
    }

    const types = await fetchTypes(ctx);
    const match = pickType(types, spec, region);

    if (!match && spec.maxHourlyPrice !== undefined) {
      throw new Error(`linode: no matching type for kind=${spec.kind} in ${region} satisfies maxHourlyPrice $${spec.maxHourlyPrice}`);
    }

    if (!match && hasHardwareConstraints(spec)) {
      throw new Error(`linode: no matching type for kind=${spec.kind} in ${region} satisfies requested hardware constraints`);
    }

    if (!match) {
      throw new Error(`linode: no matching type for kind=${spec.kind} in ${region}`);
    }

    const typeId = match.id;

    if (ctx.dryRun) {
      return {
        ...stubInstance('dry-run', 'provisioning', spec.kind),
        hourlyRate: match.price.hourly,
        sku: typeId,
        region,
      };
    }

    const login = loginPayload(ctx, config);
    ctx.log(`linode provision - type=${typeId} region=${region} image=${spec.image ?? DEFAULT_IMAGE}`);

    const instance = await linodeRequest<LinodeInstance>(ctx, 'POST', '/linode/instances', {
      label,
      region,
      type: typeId,
      image: spec.image ?? DEFAULT_IMAGE,
      booted: true,
      tags: spec.tags,
      ...login,
    });
    return { ...instanceToInstance(instance), hourlyRate: match.price.hourly };
  },

  async list(ctx) {
    ctx.log('linode list - fetching instances');
    const instances = await fetchPages<LinodeInstance>(ctx, '/linode/instances');
    const volumes = await fetchPages<LinodeVolume>(ctx, '/volumes');
    return [
      ...instances.map(instanceToInstance),
      ...volumes.map(volumeToInstance),
    ];
  },

  async destroy(ctx, instanceId) {
    ctx.log(`linode destroy - ${instanceId}`);
    if (ctx.dryRun) return;
    try {
      await linodeRequest<unknown>(ctx, 'DELETE', `/linode/instances/${instanceId}`);
      return;
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
    await linodeRequest<unknown>(ctx, 'DELETE', `/volumes/${instanceId}`);
  },

  async status(ctx, instanceId) {
    ctx.log(`linode status - ${instanceId}`);
    try {
      const instance = await linodeRequest<LinodeInstance>(ctx, 'GET', `/linode/instances/${instanceId}`);
      return instanceToInstance(instance);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
    const volume = await linodeRequest<LinodeVolume>(ctx, 'GET', `/volumes/${instanceId}`);
    return volumeToInstance(volume);
  },

  setup: tokenSetup<Config>({
    secretKey: 'LINODE_API_TOKEN',
    label: 'Linode / Akamai Cloud',
    vendorDocUrl: 'https://techdocs.akamai.com/linode-api/reference/api',
    steps: [
      'Open cloud.linode.com -> Profile -> API Tokens',
      'Create a personal access token with read/write access for Linodes and Volumes',
      'Run: sh1pt secret set LINODE_API_TOKEN <token>',
      `For image deploys, also set ${DEFAULT_ROOT_PASS_SECRET} or configure authorizedKeys/authorizedUsers`,
    ],
    fields: [
      { key: 'defaultRegion', message: 'Default region (us-east, us-central, us-west, eu-west, eu-central, ap-south, ap-northeast):' },
      { key: 'rootPassSecret', message: `Root password secret name (default ${DEFAULT_ROOT_PASS_SECRET}):` },
    ],
  }),
});

function loginPayload(ctx: { secret(key: string): string | undefined }, config: Config): Record<string, unknown> {
  const rootPass = ctx.secret(config.rootPassSecret ?? DEFAULT_ROOT_PASS_SECRET);
  const payload: Record<string, unknown> = {};
  if (rootPass) payload.root_pass = rootPass;
  if (config.authorizedKeys?.length) payload.authorized_keys = config.authorizedKeys;
  if (config.authorizedUsers?.length) payload.authorized_users = config.authorizedUsers;
  if (!rootPass && !config.authorizedKeys?.length && !config.authorizedUsers?.length) {
    throw new Error(`linode image deploy requires ${DEFAULT_ROOT_PASS_SECRET}, authorizedKeys, or authorizedUsers`);
  }
  return payload;
}

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

function instanceToInstance(instance: LinodeInstance): Instance {
  const statusMap: Record<string, Instance['status']> = {
    running: 'running',
    offline: 'stopped',
    stopped: 'stopped',
    booting: 'provisioning',
    busy: 'provisioning',
    rebooting: 'provisioning',
    shutting_down: 'provisioning',
    provisioning: 'provisioning',
    deleting: 'destroyed',
    migrating: 'provisioning',
    rebuilding: 'provisioning',
    cloning: 'provisioning',
    restoring: 'provisioning',
    billing_suspension: 'failed',
  };
  const gpus = instance.specs?.gpus ?? 0;
  const kind: Instance['kind'] = gpus > 0 || instance.type.includes('gpu') ? 'gpu' : instance.type.includes('dedicated') ? 'bare-metal' : 'cpu-vps';

  return {
    id: String(instance.id),
    kind,
    status: statusMap[instance.status] ?? 'provisioning',
    publicIp: instance.ipv4?.[0],
    privateIp: instance.ipv4?.find((ip) => ip.startsWith('192.168.')),
    createdAt: instance.created,
    hourlyRate: 0,
    currency: 'USD',
    sku: instance.type,
    region: instance.region,
    tags: instance.tags,
  };
}

function volumeToInstance(volume: LinodeVolume): Instance {
  const statusMap: Record<string, Instance['status']> = {
    active: 'running',
    creating: 'provisioning',
    resizing: 'provisioning',
    contact_support: 'failed',
  };
  return {
    id: String(volume.id),
    kind: 'block-storage',
    status: statusMap[volume.status] ?? 'provisioning',
    createdAt: volume.created,
    hourlyRate: volumeHourlyRate(volume.size),
    currency: 'USD',
    region: volume.region,
    tags: volume.tags,
  };
}

function volumeHourlyRate(sizeGb: number): number {
  return (sizeGb * VOLUME_MONTHLY_PER_GB) / 730;
}

function hasHardwareConstraints(spec: InstanceSpec): boolean {
  return !!(spec.cpu || spec.memory || spec.storage || spec.gpu?.count);
}

function labelKind(kind: InstanceSpec['kind']): string {
  if (kind === 'block-storage') return 'bs';
  if (kind === 'bare-metal') return 'metal';
  if (kind === 'cpu-vps') return 'cpu';
  return kind;
}

function resourceLabel(kind: InstanceSpec['kind']): string {
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `sh1pt-${labelKind(kind)}-${Date.now().toString(36)}-${suffix}`;
}

function pickType(types: LinodeType[], spec: InstanceSpec, region: string): LinodeType | null {
  let candidates = types.filter((type) => regionAvailable(type.region_availability, region));

  if (spec.kind === 'gpu') {
    candidates = candidates.filter((type) => (type.gpus ?? 0) > 0 || type.class === 'gpu' || type.id.includes('gpu'));
  } else if (spec.kind === 'bare-metal') {
    candidates = candidates.filter((type) => type.class === 'dedicated' || type.id.includes('dedicated'));
  } else {
    candidates = candidates.filter((type) => (
      (type.gpus ?? 0) === 0
      && type.class !== 'gpu'
      && !type.id.includes('gpu')
      && type.class !== 'dedicated'
      && !type.id.includes('dedicated')
    ));
  }

  if (spec.cpu) candidates = candidates.filter((type) => type.vcpus >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter((type) => type.memory >= spec.memory! * 1024);
  if (spec.storage) candidates = candidates.filter((type) => type.disk >= spec.storage! * 1024);
  if (spec.gpu?.count) candidates = candidates.filter((type) => (type.gpus ?? 0) >= spec.gpu!.count);
  if (spec.maxHourlyPrice !== undefined) candidates = candidates.filter((type) => type.price.hourly <= spec.maxHourlyPrice!);

  candidates.sort((a, b) => a.price.hourly - b.price.hourly);
  return candidates[0] ?? null;
}

function regionAvailable(availability: RegionAvailability | undefined, region: string): boolean {
  if (!availability) return true;
  if (Array.isArray(availability)) {
    return availability.some((item) => {
      if (typeof item === 'string') return item === region;
      if (item.region !== region) return false;
      const status = item.availability ?? item.status ?? 'available';
      return status !== 'unavailable';
    });
  }
  const status = availability[region];
  return status === undefined || status !== 'unavailable';
}

async function fetchTypes(ctx: RequestContext): Promise<LinodeType[]> {
  const response = await linodeRequest<LinodeTypesResponse>(ctx, 'GET', '/linode/types?page_size=500', undefined, false);
  return response.data;
}

async function fetchPages<T>(ctx: RequestContext, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  for (;;) {
    const response = await linodeRequest<LinodePage<T>>(ctx, 'GET', `${path}?page=${page}&page_size=500`);
    items.push(...response.data);
    if (page >= (response.pages ?? page)) return items;
    page += 1;
  }
}

interface RequestContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

async function linodeRequest<T>(
  ctx: RequestContext,
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const token = ctx.secret('LINODE_API_TOKEN');
  if (auth && !token) throw new Error('LINODE_API_TOKEN not in vault');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(stripUndefined(body)),
  });

  if (method === 'DELETE' && (response.status === 200 || response.status === 204)) {
    return undefined as T;
  }

  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    throw new LinodeApiError(method, path, response.status, extractErrorMessage(data, response.statusText || text));
  }

  return data as T;
}

class LinodeApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    message: string,
  ) {
    super(`Linode ${method} ${path} failed: ${status} ${message}`);
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof LinodeApiError && e.status === 404;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data && 'errors' in data && Array.isArray((data as { errors?: unknown }).errors)) {
    const first = (data as { errors: Array<{ reason?: unknown; field?: unknown }> }).errors[0];
    if (typeof first?.reason === 'string') {
      return typeof first.field === 'string' ? `${first.field}: ${first.reason}` : first.reason;
    }
  }
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  if (typeof data === 'string' && data) return data;
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
