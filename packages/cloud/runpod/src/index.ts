import {
  defineCloud,
  tokenSetup,
  type CloudConnectContext,
  type Instance,
  type InstanceSpec,
  type ProvisionContext,
  type Quote,
} from '@profullstack/sh1pt-core';

type Numberish = number | string;
type CloudType = 'ALL' | 'COMMUNITY' | 'SECURE';

interface Config {
  apiBaseUrl?: string;
  cloudType?: CloudType;
  gpuTypeId?: string;
  imageName?: string;
  name?: string;
  hourlyPrice?: Numberish;
  volumeInGb?: Numberish;
  containerDiskInGb?: Numberish;
  minVcpuCount?: Numberish;
  minMemoryInGb?: Numberish;
  dockerArgs?: string;
  ports?: string;
  volumeMountPath?: string;
  networkVolumeId?: string;
  env?: Record<string, string>;
}

interface RunpodGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface RunpodGpuType {
  id?: string;
  displayName?: string;
  memoryInGb?: number;
  communityPrice?: number;
  securePrice?: number;
  communitySpotPrice?: number;
  secureSpotPrice?: number;
}

interface RunpodPod {
  id?: string;
  name?: string;
  desiredStatus?: string;
  createdAt?: string;
  lastStartedAt?: string;
  costPerHr?: number;
  adjustedCostPerHr?: number;
  imageName?: string;
  machineId?: string;
  gpuCount?: number;
  runtime?: {
    ports?: Array<{
      ip?: string;
      isIpPublic?: boolean;
      publicPort?: number;
      privatePort?: number;
      type?: string;
    }>;
  };
}

const API = 'https://api.runpod.io/graphql';

const POD_FIELDS = `
  id
  name
  desiredStatus
  createdAt
  lastStartedAt
  costPerHr
  adjustedCostPerHr
  imageName
  machineId
  gpuCount
  runtime {
    ports {
      ip
      isIpPublic
      publicPort
      privatePort
      type
    }
  }
`;

export default defineCloud<Config>({
  id: 'cloud-runpod',
  label: 'RunPod (GPU)',
  supports: ['gpu'],

  async connect(ctx, config) {
    const data = await runpodGraphql<{ myself?: { id?: string; email?: string } | null }>(
      ctx,
      config,
      `query Myself {
        myself {
          id
          email
        }
      }`,
    );
    const account = requireAccount(data.myself);
    return { accountId: account.id ?? account.email ?? 'runpod-account' };
  },

  async quote(ctx, spec, config) {
    const gpu = requireGpuSpec(spec);
    const gpuTypeId = config.gpuTypeId ?? gpu.model;
    const hourly = config.hourlyPrice !== undefined
      ? nonNegativeNumber(config.hourlyPrice, 'hourlyPrice') * gpu.count
      : await quoteFromApi(ctx, spec, config, gpuTypeId);

    return {
      hourly,
      monthly: hourly * 730,
      currency: 'USD',
      provider: 'runpod',
      sku: `${gpuTypeId} x${gpu.count}`,
      spot: false,
      availabilityZone: config.cloudType ?? 'ALL',
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    const gpu = requireGpuSpec(spec);
    const quote = ctx.dryRun && config.hourlyPrice === undefined
      ? quoteFromHourly(spec, config, gpu, 0)
      : await this.quote(ctx, spec, config);
    if (spec.maxHourlyPrice !== undefined && quote.hourly > spec.maxHourlyPrice) {
      throw new Error(`RunPod quote ${quote.hourly} USD/hr exceeds maxHourlyPrice ${spec.maxHourlyPrice}`);
    }

    const name = safeName(config.name ?? `sh1pt-runpod-${Date.now().toString(36)}`);
    if (ctx.dryRun) {
      return podInstance({
        id: `dry-run-${name}`,
        name,
        desiredStatus: 'CREATED',
        createdAt: new Date().toISOString(),
        costPerHr: quote.hourly,
        gpuCount: gpu.count,
      }, quote);
    }

    if (!config.imageName) {
      throw new Error('config.imageName is required for RunPod provisioning');
    }

    const input = stripUndefined({
      cloudType: config.cloudType ?? 'ALL',
      gpuCount: gpu.count,
      gpuTypeId: config.gpuTypeId ?? gpu.model,
      name,
      imageName: config.imageName,
      dockerArgs: config.dockerArgs,
      ports: config.ports,
      volumeInGb: optionalPositiveNumber(config.volumeInGb ?? spec.storage, 'volumeInGb'),
      containerDiskInGb: nonNegativeNumber(config.containerDiskInGb ?? 40, 'containerDiskInGb'),
      minVcpuCount: optionalPositiveNumber(config.minVcpuCount ?? spec.cpu, 'minVcpuCount'),
      minMemoryInGb: optionalPositiveNumber(config.minMemoryInGb ?? spec.memory, 'minMemoryInGb'),
      volumeMountPath: config.volumeMountPath,
      networkVolumeId: config.networkVolumeId,
      env: envInput(config.env),
    });

    const data = await runpodGraphql<{ podFindAndDeployOnDemand?: RunpodPod | null }>(
      ctx,
      config,
      `mutation DeployPod($input: PodFindAndDeployOnDemandInput) {
        podFindAndDeployOnDemand(input: $input) {
          ${POD_FIELDS}
        }
      }`,
      { input },
    );

    if (!data.podFindAndDeployOnDemand) {
      throw new Error('RunPod pod was not provisioned; requested GPU capacity may be unavailable');
    }
    return podInstance(data.podFindAndDeployOnDemand, quote);
  },

  async list(ctx, config) {
    const data = await runpodGraphql<{ myself?: { pods?: RunpodPod[] } | null }>(
      ctx,
      config,
      `query Pods {
        myself {
          pods {
            ${POD_FIELDS}
          }
        }
      }`,
    );
    return (requireAccount(data.myself).pods ?? []).map((pod) => podInstance(pod));
  },

  async destroy(ctx, instanceId, config) {
    if (ctx.dryRun) {
      ctx.log(`runpod dry-run terminate pod=${instanceId}`);
      return;
    }

    await runpodGraphql<{ podTerminate: null }>(
      ctx,
      config,
      `mutation TerminatePod($input: PodTerminateInput!) {
        podTerminate(input: $input)
      }`,
      { input: { podId: instanceId } },
    );
  },

  async status(ctx, instanceId, config) {
    const data = await runpodGraphql<{ pod?: RunpodPod }>(
      ctx,
      config,
      `query Pod($input: PodFilter) {
        pod(input: $input) {
          ${POD_FIELDS}
        }
      }`,
      { input: { podId: instanceId } },
    );
    if (!data.pod) throw new Error(`RunPod pod not found: ${instanceId}`);
    return podInstance(data.pod);
  },

  setup: tokenSetup({
    secretKey: 'RUNPOD_API_KEY',
    label: 'RunPod',
    vendorDocUrl: 'https://www.runpod.io/console/user/settings',
    steps: [
      'Open runpod.io -> Settings -> API Keys',
      'Create an API key with pod read/write scope',
      'Copy the key',
      'Run: sh1pt secret set RUNPOD_API_KEY <key>',
      'Set maxHourlyPrice when provisioning GPU pods',
    ],
  }),
});

async function quoteFromApi(
  ctx: CloudConnectContext,
  spec: InstanceSpec,
  config: Config,
  gpuTypeId: string,
): Promise<number> {
  const data = await runpodGraphql<{ gpuTypes?: RunpodGpuType[] | null }>(
    ctx,
    config,
    `query GpuTypes($input: GpuTypeFilter) {
      gpuTypes(input: $input) {
        id
        displayName
        memoryInGb
        communityPrice
        securePrice
        communitySpotPrice
        secureSpotPrice
      }
    }`,
    { input: { id: gpuTypeId } },
  );
  const selected = selectGpuType(data.gpuTypes ?? [], gpuTypeId);
  const price = priceForGpu(selected, config.cloudType ?? 'ALL');
  return price * (spec.gpu?.count ?? 1);
}

function quoteFromHourly(
  spec: InstanceSpec,
  config: Config,
  gpu: NonNullable<InstanceSpec['gpu']>,
  hourly: number,
): Quote {
  const gpuTypeId = config.gpuTypeId ?? gpu.model;
  return {
    hourly,
    monthly: hourly * 730,
    currency: 'USD',
    provider: 'runpod',
    sku: `${gpuTypeId} x${gpu.count}`,
    spot: false,
    availabilityZone: config.cloudType ?? 'ALL',
  };
}

async function runpodGraphql<T>(
  ctx: CloudConnectContext | ProvisionContext,
  config: Config,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.apiBaseUrl ?? API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireToken(ctx)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let payload: RunpodGraphqlResponse<T>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    if (response.ok) throw error;
    throw new Error(`RunPod GraphQL failed: ${response.status} ${text || response.statusText}`);
  }

  if (!response.ok) {
    throw new Error(`RunPod GraphQL failed: ${response.status} ${graphqlError(payload) || response.statusText}`);
  }
  if (payload.errors?.length) {
    throw new Error(`RunPod GraphQL failed: ${graphqlError(payload)}`);
  }
  if (!payload.data) {
    throw new Error('RunPod GraphQL response did not include data');
  }
  return payload.data;
}

function requireToken(ctx: CloudConnectContext | ProvisionContext): string {
  const token = ctx.secret('RUNPOD_API_KEY');
  if (!token) throw new Error('RUNPOD_API_KEY not set - run: sh1pt secret set RUNPOD_API_KEY <key>');
  return token;
}

function requireGpuSpec(spec: InstanceSpec): NonNullable<InstanceSpec['gpu']> {
  if (spec.kind !== 'gpu') throw new Error(`cloud-runpod supports gpu specs only, got ${spec.kind}`);
  if (!spec.gpu?.model) throw new Error('cloud-runpod: spec.gpu.model is required');
  if (!spec.gpu.count || spec.gpu.count < 1) throw new Error('cloud-runpod: spec.gpu.count must be >= 1');
  return spec.gpu;
}

function selectGpuType(gpus: RunpodGpuType[], requested: string): RunpodGpuType {
  const normalized = normalize(requested);
  const selected = gpus.find((gpu) => normalize(gpu.id) === normalized || normalize(gpu.displayName) === normalized) ??
    gpus.find((gpu) => normalize(gpu.id).includes(normalized) || normalize(gpu.displayName).includes(normalized));

  if (!selected) throw new Error(`RunPod GPU type not found: ${requested}`);
  return selected;
}

function priceForGpu(gpu: RunpodGpuType, cloudType: CloudType): number {
  const community = gpu.communityPrice;
  const secure = gpu.securePrice;
  const prices = cloudType === 'COMMUNITY'
    ? validPrices([community])
    : cloudType === 'SECURE'
      ? validPrices([secure])
      : validPrices([community, secure]);
  const price = cloudType === 'ALL' && prices.length > 0 ? Math.max(...prices) : prices[0];
  if (price === undefined) {
    throw new Error(`RunPod GPU price not available for ${gpu.id ?? gpu.displayName ?? 'selected GPU'}`);
  }
  return price;
}

function validPrices(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && value >= 0);
}

function requireAccount<T extends object>(account: T | null | undefined): T {
  if (!account) {
    throw new Error('RunPod account not available; check RUNPOD_API_KEY permissions');
  }
  return account;
}

function podInstance(pod: RunpodPod, quote?: Quote): Instance {
  const id = pod.id;
  if (!id) throw new Error('RunPod pod response did not include an id');
  const publicPort = pod.runtime?.ports?.find((port) => port.isIpPublic && port.ip);
  const hourlyRate = pod.costPerHr ?? pod.adjustedCostPerHr ?? quote?.hourly ?? 0;

  return {
    id,
    kind: 'gpu',
    status: podStatus(pod.desiredStatus),
    publicIp: publicPort?.ip,
    createdAt: pod.createdAt ?? pod.lastStartedAt ?? new Date().toISOString(),
    hourlyRate,
    currency: quote?.currency ?? 'USD',
    sku: pod.imageName ?? quote?.sku,
    tags: pod.name ? [pod.name] : undefined,
  };
}

function podStatus(status: string | undefined): Instance['status'] {
  switch (status) {
    case 'RUNNING':
      return 'running';
    case 'EXITED':
    case 'STOPPED':
      return 'stopped';
    case 'TERMINATED':
      return 'destroyed';
    case 'ERROR':
    case 'FAILED':
      return 'failed';
    default:
      return 'provisioning';
  }
}

function envInput(env: Record<string, string> | undefined): Array<{ key: string; value: string }> | undefined {
  if (!env) return undefined;
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sh1pt-runpod';
}

function optionalPositiveNumber(value: Numberish | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`RunPod ${label} must be a positive number`);
  return number;
}

function nonNegativeNumber(value: Numberish, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`RunPod ${label} must be a non-negative number`);
  return number;
}

function graphqlError(payload: RunpodGraphqlResponse<unknown>): string {
  return payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ?? '';
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
