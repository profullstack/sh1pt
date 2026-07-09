import {
  defineCloud,
  tokenSetup,
  type CloudConnectContext,
  type Instance,
  type InstanceKind,
  type InstanceSpec,
  type ProvisionContext,
  type Quote,
} from '@profullstack/sh1pt-core';

type ResourceType = 'r2-bucket' | 'd1-database' | 'queue' | 'tunnel';
type ConfigResourceType = ResourceType | 'worker';

interface Config {
  accountId?: string;
  name?: string;
  defaultRegion?: string;
  resourceType?: ConfigResourceType;
  tunnelSecret?: string;
  apiBaseUrl?: string;
}

interface CloudflareEnvelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string } | string>;
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    total_pages?: number;
    total_count?: number;
  };
}

interface CloudflareAccount {
  id?: string;
  name?: string;
}

interface R2Bucket {
  name?: string;
  creation_date?: string;
  jurisdiction?: string;
  location?: string;
}

interface D1Database {
  uuid?: string;
  name?: string;
  created_at?: string;
  jurisdiction?: string;
}

interface Queue {
  queue_id?: string;
  queue_name?: string;
  created_on?: string;
  modified_on?: string;
}

interface Tunnel {
  id?: string;
  name?: string;
  created_at?: string;
  status?: string;
  tunnel_token?: string;
}

const API = 'https://api.cloudflare.com/client/v4';

export default defineCloud<Config>({
  id: 'cloud-cloudflare',
  label: 'Cloudflare (R2 / D1 / Queues / Tunnels)',
  supports: ['object-storage', 'managed-db'],

  async connect(ctx, config) {
    requireToken(ctx);

    if (config.accountId) {
      const { result } = await cfRequest<CloudflareAccount>(ctx, config, 'GET', `/accounts/${encodeURIComponent(config.accountId)}`);
      return { accountId: result.id ?? config.accountId };
    }

    return { accountId: await resolveAccountId(ctx, config) };
  },

  async quote(_ctx, spec, config) {
    const resourceType = resourceTypeFor(spec, config);
    const monthly = resourceType === 'r2-bucket' && spec.storage ? spec.storage * 0.015 : 0;

    return {
      hourly: monthly / 730,
      monthly,
      currency: 'USD',
      provider: 'cloudflare',
      sku: resourceType,
      spot: false,
      availabilityZone: spec.region,
    };
  },

  async provision(ctx, spec, config) {
    const resourceType = resourceTypeFor(spec, config);
    const quote = await this.quote(ctx, spec, config);
    if (spec.maxHourlyPrice !== undefined && quote.hourly > spec.maxHourlyPrice) {
      throw new Error(`Cloudflare quote ${quote.hourly} USD/hr exceeds maxHourlyPrice ${spec.maxHourlyPrice}`);
    }

    const name = safeName(config.name ?? `sh1pt-${resourceType}-${Date.now().toString(36)}`);
    const kind = kindForResource(resourceType);
    if (ctx.dryRun) return dryRunInstance(resourceType, name, kind, quote, spec.region);

    const accountId = await resolveAccountId(ctx, config);

    switch (resourceType) {
      case 'r2-bucket': {
        const { result } = await cfRequest<R2Bucket>(
          ctx,
          config,
          'POST',
          `/accounts/${encodeURIComponent(accountId)}/r2/buckets`,
          { name },
        );
        return bucketInstance(result, kind, quote, spec.region);
      }
      case 'd1-database': {
        const { result } = await cfRequest<D1Database>(
          ctx,
          config,
          'POST',
          `/accounts/${encodeURIComponent(accountId)}/d1/database`,
          {
            name,
            primary_location_hint: spec.region ?? config.defaultRegion,
          },
        );
        return d1Instance(result, kind, quote, spec.region ?? config.defaultRegion);
      }
      case 'queue': {
        const { result } = await cfRequest<Queue>(
          ctx,
          config,
          'POST',
          `/accounts/${encodeURIComponent(accountId)}/queues`,
          { queue_name: name },
        );
        return queueInstance(result, kind, quote, spec.region);
      }
      case 'tunnel': {
        if (!config.tunnelSecret) {
          throw new Error('Cloudflare tunnel provisioning requires config.tunnelSecret so the connector secret is not generated and lost');
        }
        const { result } = await cfRequest<Tunnel>(
          ctx,
          config,
          'POST',
          `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel`,
          {
            name,
            config_src: 'cloudflare',
            tunnel_secret: config.tunnelSecret,
          },
        );
        return tunnelInstance(result, kind, quote, spec.region);
      }
    }
  },

  async list(ctx, config) {
    const accountId = await resolveAccountId(ctx, config);
    const resourceTypes = listResourceTypes(config);
    const lists = await Promise.all(resourceTypes.map(async (resourceType) => {
      try {
        return await listResource(ctx, config, accountId, resourceType);
      } catch (error) {
        ctx.log(`Cloudflare list ${resourceType} skipped: ${errorMessage(error)}`, 'warn');
        return [];
      }
    }));

    return lists.flat();
  },

  async destroy(ctx, instanceId, config) {
    const resource = parseResourceId(instanceId, config);
    if (ctx.dryRun) {
      ctx.log(`Cloudflare dry-run destroy ${instanceId}`);
      return;
    }

    const accountId = await resolveAccountId(ctx, config);
    await cfRequest<unknown>(ctx, config, 'DELETE', deletePath(accountId, resource));
  },

  async status(ctx, instanceId, config) {
    const accountId = await resolveAccountId(ctx, config);
    const resource = parseResourceId(instanceId, config);
    const quote = zeroQuote(resource.type);

    switch (resource.type) {
      case 'r2-bucket': {
        const { result } = await cfRequest<R2Bucket>(ctx, config, 'GET', `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(resource.nativeId)}`);
        return bucketInstance(result, kindForResource(resource.type), quote);
      }
      case 'd1-database': {
        const { result } = await cfRequest<D1Database>(ctx, config, 'GET', `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(resource.nativeId)}`);
        return d1Instance(result, kindForResource(resource.type), quote);
      }
      case 'queue': {
        const { result } = await cfRequest<Queue>(ctx, config, 'GET', `/accounts/${encodeURIComponent(accountId)}/queues/${encodeURIComponent(resource.nativeId)}`);
        return queueInstance(result, kindForResource(resource.type), quote);
      }
      case 'tunnel': {
        const { result } = await cfRequest<Tunnel>(ctx, config, 'GET', `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(resource.nativeId)}`);
        return tunnelInstance(result, kindForResource(resource.type), quote);
      }
    }
  },

  setup: tokenSetup({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare (cloud)',
    vendorDocUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    steps: [
      'Open https://dash.cloudflare.com/profile/api-tokens',
      'Create an API token with the account permissions needed for R2, D1, Queues, or Cloudflare Tunnel',
      'Copy the token',
      'Run: sh1pt secret set CLOUDFLARE_API_TOKEN <token>',
      'Set accountId in the Cloudflare cloud config, or allow sh1pt to discover the first accessible account',
    ],
  }),
});

async function listResource(
  ctx: CloudConnectContext,
  config: Config,
  accountId: string,
  resourceType: ResourceType,
): Promise<Instance[]> {
  const account = encodeURIComponent(accountId);

  switch (resourceType) {
    case 'r2-bucket':
      return (await cfListAll<R2Bucket>(ctx, config, `/accounts/${account}/r2/buckets`, 'buckets'))
        .map((bucket) => bucketInstance(bucket, kindForResource('r2-bucket'), zeroQuote('r2-bucket')));
    case 'd1-database':
      return (await cfListAll<D1Database>(ctx, config, `/accounts/${account}/d1/database`, 'databases'))
        .map((db) => d1Instance(db, kindForResource('d1-database'), zeroQuote('d1-database')));
    case 'queue':
      return (await cfListAll<Queue>(ctx, config, `/accounts/${account}/queues`, 'queues'))
        .map((queue) => queueInstance(queue, kindForResource('queue'), zeroQuote('queue')));
    case 'tunnel':
      return (await cfListAll<Tunnel>(ctx, config, `/accounts/${account}/cfd_tunnel`, 'tunnels'))
        .map((tunnel) => tunnelInstance(tunnel, kindForResource('tunnel'), zeroQuote('tunnel')));
  }
}

async function cfListAll<T>(
  ctx: CloudConnectContext,
  config: Config,
  path: string,
  arrayKey: string,
): Promise<T[]> {
  const perPage = 100;
  const items: T[] = [];
  let page = 1;
  let shouldContinue = true;

  do {
    const separator = path.includes('?') ? '&' : '?';
    const { result, resultInfo } = await cfRequest<unknown>(ctx, config, 'GET', `${path}${separator}page=${page}&per_page=${perPage}`);
    const pageItems = arrayFromResult<T>(result, arrayKey);
    items.push(...pageItems);

    if (typeof resultInfo?.total_pages === 'number') {
      shouldContinue = page < resultInfo.total_pages;
    } else {
      shouldContinue = pageItems.length >= perPage;
    }
    page += 1;
  } while (shouldContinue);

  return items;
}

async function cfRequest<T>(
  ctx: CloudConnectContext | ProvisionContext,
  config: Config,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ result: T; resultInfo?: CloudflareEnvelope<unknown>['result_info'] }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${requireToken(ctx)}`,
  };
  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(stripUndefined(body));
  }

  const response = await fetch(`${config.apiBaseUrl ?? API}${path}`, init);
  if (response.status === 204) return { result: undefined as T };

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch (error) {
    if (response.ok) throw error;
    data = { errors: [{ message: text || response.statusText }] };
  }

  if (!response.ok) {
    throw new Error(`Cloudflare ${method} ${path} failed: ${response.status} ${cloudflareError(data, response.statusText)}`);
  }

  if (!isRecord(data)) return { result: data as T };
  const envelope = data as CloudflareEnvelope<T>;
  if (envelope.success === false) {
    throw new Error(`Cloudflare ${method} ${path} failed: ${cloudflareError(envelope, 'request failed')}`);
  }

  return { result: envelope.result as T, resultInfo: envelope.result_info };
}

async function resolveAccountId(ctx: CloudConnectContext | ProvisionContext, config: Config): Promise<string> {
  if (config.accountId) return config.accountId;

  const accounts = await cfListAll<CloudflareAccount>(ctx, config, '/accounts', 'accounts');
  const first = accounts[0];
  if (!first?.id) throw new Error('Cloudflare accountId not found; set accountId in cloud config');
  return first.id;
}

function requireToken(ctx: CloudConnectContext | ProvisionContext): string {
  const token = ctx.secret('CLOUDFLARE_API_TOKEN');
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN not in vault - run: sh1pt secret set CLOUDFLARE_API_TOKEN <token>');
  }
  return token;
}

function resourceTypeFor(spec: InstanceSpec, config: Config): ResourceType {
  if (config.resourceType === 'worker') {
    throw new Error('Cloudflare Workers scripts are handled by the deploy-workers target, not cloud-cloudflare');
  }
  if (config.resourceType) return config.resourceType;
  if (spec.kind === 'managed-db') return 'd1-database';
  if (spec.kind === 'object-storage') return 'r2-bucket';
  throw new Error(`cloud-cloudflare supports object-storage and managed-db specs; got ${spec.kind}`);
}

function kindForResource(resourceType: ResourceType): InstanceKind {
  switch (resourceType) {
    case 'r2-bucket':
    case 'queue':
    case 'tunnel':
      return 'object-storage';
    case 'd1-database':
      return 'managed-db';
  }
}

function listResourceTypes(config: Config): ResourceType[] {
  if (config.resourceType === 'worker') {
    throw new Error('Cloudflare Workers scripts are handled by the deploy-workers target, not cloud-cloudflare');
  }
  return config.resourceType ? [config.resourceType] : ['r2-bucket', 'd1-database', 'queue', 'tunnel'];
}

function parseResourceId(instanceId: string, config: Config): { type: ResourceType; nativeId: string } {
  const [prefix, ...rest] = instanceId.split(':');
  const nativeId = rest.join(':');

  if (prefix && nativeId) {
    if (prefix === 'r2') return { type: 'r2-bucket', nativeId };
    if (prefix === 'd1') return { type: 'd1-database', nativeId };
    if (prefix === 'queue') return { type: 'queue', nativeId };
    if (prefix === 'tunnel') return { type: 'tunnel', nativeId };
  }

  if (config.resourceType === 'worker') {
    throw new Error('Cloudflare Workers scripts are handled by the deploy-workers target, not cloud-cloudflare');
  }

  return { type: config.resourceType ?? 'r2-bucket', nativeId: instanceId };
}

function deletePath(accountId: string, resource: { type: ResourceType; nativeId: string }): string {
  const account = encodeURIComponent(accountId);
  const nativeId = encodeURIComponent(resource.nativeId);

  switch (resource.type) {
    case 'r2-bucket':
      return `/accounts/${account}/r2/buckets/${nativeId}`;
    case 'd1-database':
      return `/accounts/${account}/d1/database/${nativeId}`;
    case 'queue':
      return `/accounts/${account}/queues/${nativeId}`;
    case 'tunnel':
      return `/accounts/${account}/cfd_tunnel/${nativeId}`;
  }
}

function dryRunInstance(
  resourceType: ResourceType,
  name: string,
  kind: InstanceKind,
  quote: Quote,
  region?: string,
): Instance {
  return {
    id: prefixedId(resourceType, `dry-run-${name}`),
    kind,
    status: 'provisioning',
    createdAt: new Date().toISOString(),
    hourlyRate: quote.hourly,
    currency: quote.currency,
    sku: quote.sku,
    region,
  };
}

function bucketInstance(bucket: R2Bucket, kind: InstanceKind, quote: Quote, fallbackRegion?: string): Instance {
  const name = requiredId(bucket.name, 'Cloudflare R2 bucket');
  return {
    id: prefixedId('r2-bucket', name),
    kind,
    status: 'running',
    createdAt: iso(bucket.creation_date),
    hourlyRate: quote.hourly,
    currency: quote.currency,
    sku: quote.sku,
    region: bucket.location ?? bucket.jurisdiction ?? fallbackRegion,
  };
}

function d1Instance(db: D1Database, kind: InstanceKind, quote: Quote, fallbackRegion?: string): Instance {
  const id = requiredId(db.uuid ?? db.name, 'Cloudflare D1 database');
  return {
    id: prefixedId('d1-database', id),
    kind,
    status: 'running',
    createdAt: iso(db.created_at),
    hourlyRate: quote.hourly,
    currency: quote.currency,
    sku: quote.sku,
    region: db.jurisdiction ?? fallbackRegion,
  };
}

function queueInstance(queue: Queue, kind: InstanceKind, quote: Quote, fallbackRegion?: string): Instance {
  const id = requiredId(queue.queue_id ?? queue.queue_name, 'Cloudflare Queue');
  return {
    id: prefixedId('queue', id),
    kind,
    status: 'running',
    createdAt: iso(queue.created_on ?? queue.modified_on),
    hourlyRate: quote.hourly,
    currency: quote.currency,
    sku: quote.sku,
    region: fallbackRegion,
  };
}

function tunnelInstance(tunnel: Tunnel, kind: InstanceKind, quote: Quote, fallbackRegion?: string): Instance {
  const id = requiredId(tunnel.id ?? tunnel.name, 'Cloudflare Tunnel');
  return {
    id: prefixedId('tunnel', id),
    kind,
    status: tunnelStatus(tunnel.status),
    createdAt: iso(tunnel.created_at),
    hourlyRate: quote.hourly,
    currency: quote.currency,
    sku: quote.sku,
    region: fallbackRegion,
    ...(tunnel.tunnel_token ? { metadata: { cloudflareTunnelToken: tunnel.tunnel_token } } : {}),
  };
}

function tunnelStatus(status: string | undefined): Instance['status'] {
  const normalized = status?.toLowerCase();
  if (!normalized) return 'provisioning';
  if (normalized === 'healthy' || normalized === 'active' || normalized === 'running') return 'running';
  if (normalized === 'inactive' || normalized === 'down' || normalized === 'stopped') return 'stopped';
  if (normalized === 'degraded' || normalized === 'errored' || normalized === 'error' || normalized === 'failed' || normalized === 'unhealthy') return 'failed';
  if (normalized === 'pending' || normalized === 'provisioning' || normalized === 'initializing') return 'provisioning';
  return 'provisioning';
}

function prefixedId(resourceType: ResourceType, nativeId: string): string {
  const prefix: Record<ResourceType, string> = {
    'r2-bucket': 'r2',
    'd1-database': 'd1',
    queue: 'queue',
    tunnel: 'tunnel',
  };
  return `${prefix[resourceType]}:${nativeId}`;
}

function zeroQuote(resourceType: ResourceType): Quote {
  return {
    hourly: 0,
    monthly: 0,
    currency: 'USD',
    provider: 'cloudflare',
    sku: resourceType,
    spot: false,
  };
}

function safeName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const clipped = normalized.slice(0, 60).replace(/-+$/g, '');
  if (clipped.length >= 3) return clipped;
  return `sh1pt-${clipped || 'resource'}`.slice(0, 63);
}

function requiredId(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} response did not include an id`);
  return value;
}

function iso(value: string | undefined): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function arrayFromResult<T>(result: unknown, arrayKey: string): T[] {
  if (Array.isArray(result)) return result as T[];
  if (!isRecord(result)) return [];

  const keyed = result[arrayKey];
  if (Array.isArray(keyed)) return keyed as T[];
  return [];
}

function cloudflareError(data: unknown, fallback: string): string {
  if (!isRecord(data)) return fallback;

  const errors = Array.isArray(data.errors) ? data.errors : [];
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const details = [...errors, ...messages]
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item)) return item.message ?? item.code;
      return undefined;
    })
    .filter((item): item is string | number => item !== undefined)
    .join('; ');

  return details || fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
