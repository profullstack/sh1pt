import { defineCloud, tokenSetup, type Instance, type InstanceSpec, type Quote } from '@profullstack/sh1pt-core';

interface Config {
  apiToken?: string;
  defaultCpu?: Numberish;
  defaultMemoryGb?: Numberish;
  defaultDiskGb?: Numberish;
}

type Numberish = number | string;

interface ExeVm {
  vm_name?: string;
  name?: string;
  ssh_dest?: string;
  https_url?: string;
  status?: string;
  region?: string;
  created_at?: string;
  createdAt?: string;
}

interface ExeListResponse {
  vms?: ExeVm[];
}

interface ExeWhoamiResponse {
  email?: string;
  user?: string;
  username?: string;
  account?: {
    id?: string;
    email?: string;
  };
}

const EXE_API = 'https://exe.dev/exec';

export default defineCloud<Config>({
  id: 'cloud-exe-dev',
  label: 'exe.dev (persistent VMs)',
  supports: ['cpu-vps'],

  async connect(ctx) {
    if (!ctx.secret('EXE_DEV_TOKEN')) throw new Error('EXE_DEV_TOKEN not in vault - `sh1pt secret set EXE_DEV_TOKEN ...`');
    ctx.log('exe.dev connect - verifying HTTPS API token');

    const whoami = await exeJson<ExeWhoamiResponse>(ctx, 'whoami --json');
    const accountId = whoami.account?.id ?? whoami.email ?? whoami.user ?? whoami.username ?? 'exe-dev-account';
    ctx.log(`exe.dev connected - account=${accountId}`);
    return { accountId };
  },

  async quote(ctx, spec, config) {
    const cpu = positiveNumber(spec.cpu ?? config.defaultCpu, 2);
    const memory = positiveNumber(spec.memory ?? config.defaultMemoryGb, 4);
    const disk = positiveNumber(spec.storage ?? config.defaultDiskGb, 20);

    ctx.log(`exe.dev quote - cpu=${cpu} memory=${memory}GB disk=${disk}GB`);
    return {
      hourly: 0,
      monthly: 0,
      currency: 'USD',
      provider: 'exe.dev',
      sku: `${cpu}cpu-${memory}gb-${disk}gb`,
      spot: false,
    } satisfies Quote;
  },

  async provision(ctx, spec, config) {
    if (spec.kind !== 'cpu-vps') {
      throw new Error(`cloud-exe-dev supports cpu-vps only, got ${spec.kind}`);
    }

    const name = safeName(`sh1pt-${Date.now()}`);
    const cpu = positiveNumber(spec.cpu ?? config.defaultCpu, 2);
    const memory = positiveNumber(spec.memory ?? config.defaultMemoryGb, 4);
    const disk = positiveNumber(spec.storage ?? config.defaultDiskGb, 20);

    if (spec.region) {
      ctx.log(`exe.dev region is account-level; ignoring per-VM region ${spec.region}`, 'warn');
    }

    const args = [
      'new',
      '--json',
      `--name=${name}`,
      `--cpu=${cpu}`,
      `--memory=${memory}GB`,
      `--disk=${disk}GB`,
      ...(spec.image ? [`--image=${quoteArg(spec.image)}`] : []),
      ...(spec.tags ?? []).flatMap((tag) => [`--tag=${quoteArg(tag)}`]),
    ];

    ctx.log(`exe.dev provision - ${name} (${cpu} CPU, ${memory}GB RAM, ${disk}GB disk)`);
    if (ctx.dryRun) {
      return stubInstance(name, 'provisioning', spec, 0);
    }

    const vm = await exeJson<ExeVm>(ctx, args.join(' '));
    return vmToInstance(vm, spec, 0, name);
  },

  async list(ctx) {
    ctx.log('exe.dev list - fetching VMs');
    const result = await exeJson<ExeListResponse>(ctx, 'ls -la --json');
    return (result.vms ?? []).map((vm) => vmToInstance(vm, { kind: 'cpu-vps' }, 0));
  },

  async destroy(ctx, instanceId) {
    ctx.log(`exe.dev destroy - ${instanceId}`);
    if (ctx.dryRun) return;
    await exeText(ctx, `rm ${quoteArg(instanceId)} --json`);
  },

  async status(ctx, instanceId) {
    ctx.log(`exe.dev status - ${instanceId}`);
    const stats = await exeJson<Record<string, unknown>>(ctx, `stat ${quoteArg(instanceId)} --json`);
    const vm = normalizeVm({ ...stats, vm_name: instanceId });
    return vmToInstance(vm, { kind: 'cpu-vps' }, 0, instanceId);
  },

  setup: tokenSetup<Config>({
    secretKey: 'EXE_DEV_TOKEN',
    label: 'exe.dev',
    vendorDocUrl: 'https://exe.dev/docs/https-api',
    steps: [
      'Register an SSH key with exe.dev',
      'Generate an HTTPS API key: ssh exe.dev ssh-key generate-api-key --exp=30d',
      'Save it in sh1pt: sh1pt secret set EXE_DEV_TOKEN <token>',
      'Optional: set defaultCpu, defaultMemoryGb, and defaultDiskGb during setup',
    ],
    fields: [
      { key: 'defaultCpu', message: 'Default CPU count (optional):' },
      { key: 'defaultMemoryGb', message: 'Default memory in GB (optional):' },
      { key: 'defaultDiskGb', message: 'Default disk in GB (optional):' },
    ],
  }),
});

async function exeJson<T>(ctx: { secret(key: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void }, command: string): Promise<T> {
  const text = await exeText(ctx, command);
  try {
    return JSON.parse(text) as T;
  } catch {
    ctx.log(`exe.dev returned non-JSON output for: ${command}`, 'warn');
    return {} as T;
  }
}

async function exeText(ctx: { secret(key: string): string | undefined }, command: string): Promise<string> {
  const token = ctx.secret('EXE_DEV_TOKEN');
  if (!token) throw new Error('EXE_DEV_TOKEN not in vault - `sh1pt secret set EXE_DEV_TOKEN ...`');

  const res = await fetch(EXE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: command,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`exe.dev API ${res.status}: ${body.trim() || res.statusText}`);
  }
  return body.trim();
}

function vmToInstance(vm: ExeVm, spec: Partial<InstanceSpec>, hourlyRate: number, fallbackId = 'exe-dev-vm'): Instance {
  const normalized = normalizeVm(vm);
  return {
    id: normalized.vm_name ?? normalized.name ?? fallbackId,
    kind: 'cpu-vps',
    status: mapStatus(normalized.status),
    publicIp: undefined,
    createdAt: normalized.created_at ?? normalized.createdAt ?? new Date().toISOString(),
    hourlyRate,
    currency: 'USD',
    sku: spec.cpu || spec.memory || spec.storage
      ? `${spec.cpu ?? 2}cpu-${spec.memory ?? 4}gb-${spec.storage ?? 20}gb`
      : undefined,
    region: normalized.region,
    tags: spec.tags,
  };
}

function normalizeVm(input: ExeVm | Record<string, unknown>): ExeVm {
  const vm = input as ExeVm;
  return {
    ...vm,
    vm_name: vm.vm_name ?? vm.name,
  };
}

function mapStatus(status: string | undefined): Instance['status'] {
  switch (status) {
    case 'running':
    case 'ready':
      return 'running';
    case 'stopped':
    case 'off':
      return 'stopped';
    case 'failed':
    case 'error':
      return 'failed';
    case 'destroyed':
    case 'deleted':
      return 'destroyed';
    default:
      return 'provisioning';
  }
}

function stubInstance(id: string, status: Instance['status'], spec: InstanceSpec, hourlyRate: number): Instance {
  return {
    id,
    kind: spec.kind,
    status,
    createdAt: new Date().toISOString(),
    hourlyRate,
    currency: 'USD',
    sku: `${spec.cpu ?? 2}cpu-${spec.memory ?? 4}gb-${spec.storage ?? 20}gb`,
    tags: spec.tags,
  };
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

function positiveNumber(value: Numberish | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
