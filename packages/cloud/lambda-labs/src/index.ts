import { defineCloud, tokenSetup, type Instance, type InstanceSpec, type Quote } from '@profullstack/sh1pt-core';

// Lambda Labs Cloud — GPU-first instances with public pricing metadata.
// API docs: https://docs.lambda.ai/public-cloud/cloud-api/
interface Config {
  defaultRegion?: string;
  sshKeyNames?: string[];
  fileSystemNames?: string[];
  image?: string | { id?: string; family?: string };
  userDataSecret?: string;
  tags?: Record<string, string>;
}

const API = 'https://cloud.lambda.ai/api/v1';
const SECRET_KEY = 'LAMBDA_CLOUD_API_KEY';
const DEFAULT_REGION = 'us-west-1';

interface LambdaRegion {
  name: string;
  description: string;
}

interface LambdaInstanceTypeSpecs {
  vcpus: number;
  memory_gib: number;
  storage_gib: number;
  gpus: number;
}

interface LambdaInstanceType {
  name: string;
  description: string;
  gpu_description: string;
  price_cents_per_hour: number;
  specs: LambdaInstanceTypeSpecs;
}

interface LambdaInstanceTypesItem {
  instance_type: LambdaInstanceType;
  regions_with_capacity_available: LambdaRegion[];
}

interface LambdaInstance {
  id: string;
  name?: string;
  ip?: string;
  private_ip?: string;
  created?: string;
  created_at?: string;
  launched_at?: string;
  launch_time?: string;
  started_at?: string;
  status: 'booting' | 'active' | 'unhealthy' | 'terminated' | 'terminating' | 'preempted';
  ssh_key_names: string[];
  file_system_names: string[];
  region: LambdaRegion;
  instance_type: LambdaInstanceType;
  tags?: Array<{ key: string; value: string }>;
}

interface LambdaLaunchResponse {
  instance_ids: string[];
}

interface LambdaTerminateResponse {
  terminated_instances: LambdaInstance[];
}

interface DataResponse<T> {
  data: T;
}

type RequestContext = {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
};

export default defineCloud<Config>({
  id: 'cloud-lambda-labs',
  label: 'Lambda Labs (GPU Cloud)',
  supports: ['gpu'],

  async connect(ctx) {
    const key = ctx.secret(SECRET_KEY);
    if (!key) throw new Error(`${SECRET_KEY} not in vault - \`sh1pt secret set ${SECRET_KEY}\``);
    ctx.log('lambda-labs connect - verifying token');
    await lambdaRequest<DataResponse<LambdaInstance[]>>(ctx, 'GET', '/instances');
    return { accountId: 'lambda-cloud-account' };
  },

  async quote(ctx, spec, config) {
    ctx.log(`lambda-labs quote - gpu=${spec.gpu?.model ?? 'any'} x${spec.gpu?.count ?? 1} region=${spec.region ?? config.defaultRegion ?? 'any'}`);
    let items: LambdaInstanceTypesItem[];
    try {
      items = await fetchInstanceTypes(ctx);
    } catch (e) {
      ctx.log(`lambda-labs quote - could not fetch instance types (${e instanceof Error ? e.message : String(e)})`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'USD', provider: 'lambda-labs', sku: 'unknown', spot: false };
    }

    const match = pickInstanceType(items, spec, spec.region ?? config.defaultRegion);
    if (!match) {
      ctx.log('lambda-labs quote - no matching instance type found', 'warn');
      return { hourly: 0, monthly: 0, currency: 'USD', provider: 'lambda-labs', sku: 'none', spot: false };
    }

    return quoteFromType(match.instance_type, match.regions_with_capacity_available[0]?.name);
  },

  async provision(ctx, spec, config) {
    if (spec.kind !== 'gpu') throw new Error('lambda-labs supports only GPU instances');
    if (ctx.dryRun) return { ...stubInstance('dry-run', 'provisioning'), region: spec.region ?? config.defaultRegion ?? DEFAULT_REGION };

    const items = await fetchInstanceTypes(ctx);
    const match = pickInstanceType(items, spec, spec.region ?? config.defaultRegion);
    if (!match) throw new Error('lambda-labs: no matching GPU instance type is currently available');

    const quote = quoteFromType(match.instance_type, match.regions_with_capacity_available[0]?.name);
    if (spec.maxHourlyPrice !== undefined && quote.hourly > spec.maxHourlyPrice) {
      throw new Error(`lambda-labs: cheapest matching type (${match.instance_type.name}) costs $${quote.hourly}/hr, exceeds maxHourlyPrice $${spec.maxHourlyPrice}`);
    }

    const sshKeyNames = spec.sshKeyIds?.length ? spec.sshKeyIds : config.sshKeyNames;
    if (!sshKeyNames?.length) {
      throw new Error('lambda-labs launch requires one SSH key name; pass spec.sshKeyIds or configure sshKeyNames');
    }
    if (sshKeyNames.length !== 1) {
      throw new Error('lambda-labs launch requires exactly one SSH key name');
    }

    const region = spec.region ?? config.defaultRegion ?? match.regions_with_capacity_available[0]?.name ?? DEFAULT_REGION;
    const name = `sh1pt-${spec.kind}-${Date.now()}`;
    ctx.log(`lambda-labs provision - type=${match.instance_type.name} region=${region}`);

    const result = await lambdaRequest<DataResponse<LambdaLaunchResponse>>(ctx, 'POST', '/instance-operations/launch', {
      region_name: region,
      instance_type_name: match.instance_type.name,
      ssh_key_names: sshKeyNames,
      file_system_names: config.fileSystemNames,
      name,
      image: normalizeImage(spec.image ?? config.image),
      user_data: config.userDataSecret ? ctx.secret(config.userDataSecret) : undefined,
      tags: tagsToEntries({ ...config.tags, ...tagsFromList(spec.tags) }),
    });

    const instanceId = result.data.instance_ids[0];
    if (!instanceId) {
      throw new Error('lambda-labs launch succeeded but returned no instance ID');
    }

    return {
      id: instanceId,
      kind: 'gpu',
      status: 'provisioning',
      createdAt: new Date().toISOString(),
      hourlyRate: quote.hourly,
      currency: 'USD',
      sku: match.instance_type.name,
      region,
      tags: spec.tags,
    } satisfies Instance;
  },

  async list(ctx) {
    ctx.log('lambda-labs list - fetching instances');
    const result = await lambdaRequest<DataResponse<LambdaInstance[]>>(ctx, 'GET', '/instances');
    return result.data.map(instanceToInstance);
  },

  async destroy(ctx, instanceId) {
    ctx.log(`lambda-labs destroy - ${instanceId}`);
    await lambdaRequest<DataResponse<LambdaTerminateResponse>>(ctx, 'POST', '/instance-operations/terminate', {
      instance_ids: [instanceId],
    });
  },

  async status(ctx, instanceId) {
    ctx.log(`lambda-labs status - ${instanceId}`);
    const result = await lambdaRequest<DataResponse<LambdaInstance>>(ctx, 'GET', `/instances/${instanceId}`);
    return instanceToInstance(result.data);
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Lambda Labs Cloud',
    vendorDocUrl: 'https://docs.lambda.ai/public-cloud/cloud-api/',
    steps: [
      'Open cloud.lambda.ai -> API keys',
      'Create a Cloud API key with instance read/write access',
      `Run: sh1pt secret set ${SECRET_KEY} <token>`,
      'Create or note one SSH key name in Lambda Cloud before provisioning',
      'GPU instances bill hourly - always use --max-hourly-price for provision actions',
    ],
    fields: [
      { key: 'defaultRegion', message: 'Default region (for example, us-west-1):' },
    ],
  }),
});

function stubInstance(id: string, status: Instance['status']): Instance {
  return {
    id,
    kind: 'gpu',
    status,
    createdAt: new Date().toISOString(),
    hourlyRate: 0,
    currency: 'USD',
  };
}

function instanceToInstance(instance: LambdaInstance): Instance {
  const statusMap: Record<LambdaInstance['status'], Instance['status']> = {
    booting: 'provisioning',
    active: 'running',
    unhealthy: 'failed',
    terminated: 'destroyed',
    terminating: 'stopped',
    preempted: 'destroyed',
  };

  return {
    id: instance.id,
    kind: 'gpu',
    status: statusMap[instance.status] ?? 'provisioning',
    publicIp: instance.ip,
    privateIp: instance.private_ip,
    createdAt: instanceCreatedAt(instance),
    hourlyRate: instance.instance_type.price_cents_per_hour / 100,
    currency: 'USD',
    sku: instance.instance_type.name,
    region: instance.region.name,
    tags: instance.tags?.map((tag) => `${tag.key}:${tag.value}`),
  };
}

function quoteFromType(instanceType: LambdaInstanceType, region?: string): Quote {
  const hourly = instanceType.price_cents_per_hour / 100;
  return {
    hourly,
    monthly: hourly * 730,
    currency: 'USD',
    provider: 'lambda-labs',
    sku: instanceType.name,
    spot: false,
    availabilityZone: region,
  };
}

function pickInstanceType(
  items: LambdaInstanceTypesItem[],
  spec: InstanceSpec,
  region?: string,
): LambdaInstanceTypesItem | null {
  let candidates = items.filter((item) => item.regions_with_capacity_available.length > 0);

  if (region) {
    candidates = candidates.filter((item) =>
      item.regions_with_capacity_available.some((availableRegion) => availableRegion.name === region),
    );
  }

  if (spec.gpu?.model) {
    candidates = candidates.filter((item) => {
      const type = item.instance_type;
      return gpuModelMatches(type, spec.gpu!.model);
    });
  }

  if (spec.cpu) candidates = candidates.filter((item) => item.instance_type.specs.vcpus >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter((item) => item.instance_type.specs.memory_gib >= spec.memory!);
  if (spec.storage) candidates = candidates.filter((item) => item.instance_type.specs.storage_gib >= spec.storage!);
  if (spec.gpu?.count) candidates = candidates.filter((item) => item.instance_type.specs.gpus >= spec.gpu!.count);
  if (spec.maxHourlyPrice !== undefined) {
    candidates = candidates.filter((item) => item.instance_type.price_cents_per_hour / 100 <= spec.maxHourlyPrice!);
  }

  candidates.sort((a, b) => a.instance_type.price_cents_per_hour - b.instance_type.price_cents_per_hour);
  return candidates[0] ?? null;
}

async function fetchInstanceTypes(ctx: RequestContext): Promise<LambdaInstanceTypesItem[]> {
  const result = await lambdaRequest<DataResponse<Record<string, LambdaInstanceTypesItem>>>(ctx, 'GET', '/instance-types');
  return Object.values(result.data);
}

async function lambdaRequest<T>(
  ctx: RequestContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = ctx.secret(SECRET_KEY);
  if (!token) throw new Error(`${SECRET_KEY} not in vault`);

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(stripUndefined(body)),
  });

  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    throw new Error(`Lambda Labs ${method} ${path} failed: ${response.status} ${extractErrorMessage(data, response.statusText || text)}`);
  }

  return data as T;
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
  if (typeof data === 'object' && data && 'error' in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      const code = (error as { code: string }).code;
      const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? `: ${(error as { message: string }).message}`
        : '';
      return `${code}${message}`;
    }
    if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }
  if (typeof data === 'object' && data && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  if (typeof data === 'string' && data) return data;
  return fallback;
}

function normalizeGpuModel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function gpuModelMatches(instanceType: LambdaInstanceType, model: string): boolean {
  const needle = normalizeGpuModel(model);
  const tokens = `${instanceType.name} ${instanceType.description} ${instanceType.gpu_description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.includes(needle)) return true;
  return needle.length > 3 && tokens.join('').includes(needle);
}

function normalizeImage(image: string | { id?: string; family?: string } | undefined): { id: string } | { family: string } | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return { family: image };
  if (image.id) return { id: image.id };
  if (image.family) return { family: image.family };
  return undefined;
}

function tagsFromList(tags: string[] | undefined): Record<string, string> {
  return Object.fromEntries((tags ?? []).map((tag, index) => {
    const separator = tag.indexOf(':');
    if (separator > 0) {
      const key = tag.slice(0, separator).trim();
      const value = tag.slice(separator + 1).trim();
      if (key && value) return [key, value];
    }
    return [`tag-${index + 1}`, tag];
  }));
}

function tagsToEntries(tags: Record<string, string>): Array<{ key: string; value: string }> | undefined {
  const entries = Object.entries(tags)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({ key: normalizeTagKey(key), value: value.slice(0, 128) }));
  return entries.length ? entries : undefined;
}

function normalizeTagKey(key: string): string {
  const normalized = key.toLowerCase().replace(/[^a-z0-9-:]+/g, '-').slice(0, 55);
  return /^[a-z]/.test(normalized) ? normalized : `tag-${normalized}`.slice(0, 55);
}

function instanceCreatedAt(instance: LambdaInstance): string {
  return firstIsoString(
    instance.created_at,
    instance.created,
    instance.launched_at,
    instance.launch_time,
    instance.started_at,
  ) ?? '1970-01-01T00:00:00.000Z';
}

function firstIsoString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && !Number.isNaN(Date.parse(value)));
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
