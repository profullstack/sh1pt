import { createHmac, randomUUID } from 'node:crypto';
import { defineCloud, tokenSetup, type Instance, type InstanceSpec, type Quote } from '@profullstack/sh1pt-core';

// Atlantic.Net Cloud API — classic signed query API for Cloud Servers.
// API docs: https://www.atlantic.net/docs/api/
interface Config {
  apiKey?: string;            // prefer ATLANTIC_API_KEY secret
  secretKey?: string;         // prefer ATLANTIC_SECRET_KEY secret
  defaultRegion?: string;     // USEAST2, USEAST1, CAEAST1, EUWEST1, etc.
  defaultImage?: string;      // provider image id; resolved from describe-image when omitted
}

const API = 'https://cloudapi.atlantic.net/';
const VERSION = '2010-12-30';
const DEFAULT_REGION = 'USEAST2';
const DEFAULT_PLATFORM = 'linux';

interface AtlanticPlan {
  plan_name?: string;
  name?: string;
  display_name?: string;
  display_disk?: string;
  display_ram?: string;
  disk?: string;
  ram?: string;
  num_cpu?: string;
  cpu?: string;
  rate_per_hr?: string;
  rate_per_hour?: string;
  price_per_hr?: string;
  rate_per_month?: string;
  plan_type?: string;
  platform?: string;
  ostype?: string;
}

interface AtlanticImage {
  imageid?: string;
  image_id?: string;
  displayname?: string;
  display_name?: string;
  image_type?: string;
  ostype?: string;
  platform?: string;
  architecture?: string;
  version?: string;
}

interface AtlanticInstanceRecord {
  InstanceId?: string;
  instanceid?: string;
  vm_status?: string;
  status?: string;
  vm_ip_address?: string;
  ip_address?: string;
  rate_per_hr?: string;
  vm_created_date?: string;
  created_date?: string;
  vm_plan_name?: string;
  planname?: string;
  plan_name?: string;
  vm_location?: string;
  vm_description?: string;
  vm_name?: string;
}

interface AtlanticRunInstanceRecord {
  InstanceId?: string;
  instanceid?: string;
  ip_address?: string;
  vm_status?: string;
}

export default defineCloud<Config>({
  id: 'cloud-atlantic',
  label: 'Atlantic.Net (VPS)',
  supports: ['cpu-vps', 'bare-metal'],

  async connect(ctx, config) {
    requireCredentials(ctx, config);
    ctx.log('atlantic connect · verifying credentials...');
    await atlanticRequest(ctx, config, 'list-instances');
    ctx.log('atlantic connected');
    // Atlantic.Net's Cloud API credential-check path does not expose a stable account id.
    return { accountId: 'atlantic-account' };
  },

  async quote(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? DEFAULT_REGION;
    ctx.log(`atlantic quote · kind=${spec.kind} · region=${region}`);
    const plans = await fetchPlans(ctx, config);
    const match = pickPlan(plans, spec);
    if (!match) {
      throw new Error(`Atlantic.Net no matching ${spec.kind} plan found for cpu=${spec.cpu ?? 'any'} memory=${spec.memory ?? 'any'}GB storage=${spec.storage ?? 'any'}GB`);
    }

    return planToQuote(match);
  },

  async provision(ctx, spec, config) {
    const region = spec.region ?? config.defaultRegion ?? DEFAULT_REGION;
    const name = buildServerName(spec.kind);
    if (ctx.dryRun) {
      return { ...stubInstance('dry-run', 'provisioning', spec.kind), region };
    }

    const plans = await fetchPlans(ctx, config);
    const match = pickPlan(plans, spec);
    if (!match) {
      throw new Error(`Atlantic.Net no matching ${spec.kind} plan found for provisioning`);
    }

    if ((spec.sshKeyIds?.length ?? 0) > 1) {
      throw new Error('Atlantic.Net run-instance accepts one SSH key id; pass a single sshKeyIds value');
    }

    const imageId = spec.image ?? config.defaultImage ?? await pickDefaultImage(ctx, config);
    ctx.log(`atlantic provision · plan=${planName(match)} · region=${region} · image=${imageId}`);

    const result = await atlanticRequest(ctx, config, 'run-instance', {
      planname: planName(match),
      imageid: imageId,
      server_qty: '1',
      servername: name,
      vm_location: region,
      enablebackup: 'N',
      term: 'on-demand',
      ...(spec.sshKeyIds?.[0] ? { key_id: spec.sshKeyIds[0] } : {}),
    });
    const record = firstItem<AtlanticRunInstanceRecord>(responseSet(result, 'run-instanceresponse', 'instancesSet'));
    if (!record) {
      throw new Error('Atlantic.Net run-instance returned no instance record');
    }
    const id = record?.instanceid ?? record?.InstanceId;
    if (!id) {
      throw new Error('Atlantic.Net run-instance did not return an instance id');
    }

    return {
      id,
      kind: spec.kind,
      status: 'provisioning',
      publicIp: record.ip_address,
      createdAt: new Date().toISOString(),
      hourlyRate: planHourly(match),
      currency: 'USD',
      sku: planName(match),
      region,
    } satisfies Instance;
  },

  async list(ctx, config) {
    ctx.log('atlantic list · fetching instances');
    const result = await atlanticRequest(ctx, config, 'list-instances');
    return itemsFromSet<AtlanticInstanceRecord>(responseSet(result, 'list-instancesresponse', 'instancesSet'))
      .map(instanceToInstance);
  },

  async destroy(ctx, instanceId, config) {
    ctx.log(`atlantic destroy · ${instanceId}`);
    if (ctx.dryRun) return;
    await atlanticRequest(ctx, config, 'terminate-instance', { instanceid: instanceId });
  },

  async status(ctx, instanceId, config) {
    ctx.log(`atlantic status · ${instanceId}`);
    const result = await atlanticRequest(ctx, config, 'describe-instance', { instanceid: instanceId });
    const record = firstItem<AtlanticInstanceRecord>(responseSet(result, 'describe-instanceresponse', 'instancesSet'));
    if (!record) {
      throw new Error(`Atlantic.Net describe-instance returned no instance for ${instanceId}`);
    }
    return instanceToInstance(record);
  },

  setup: tokenSetup<Config>({
    secretKey: 'ATLANTIC_API_KEY',
    label: 'Atlantic.Net',
    vendorDocUrl: 'https://www.atlantic.net/docs/api/',
    steps: [
      'Log in to cloud.atlantic.net → API Info',
      'Copy the API Key and API Secret Private Key',
      'Run: sh1pt secret set ATLANTIC_API_KEY <api-key>',
      'Run: sh1pt secret set ATLANTIC_SECRET_KEY <private-key>',
    ],
    fields: [
      { key: 'defaultRegion', message: 'Default region (USEAST2, USEAST1, CAEAST1, EUWEST1, etc.):' },
      { key: 'defaultImage', message: 'Default image id (optional; auto-detects Ubuntu Linux when blank):' },
    ],
  }),
});

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

function instanceToInstance(record: AtlanticInstanceRecord): Instance {
  const id = record.InstanceId ?? record.instanceid;
  if (!id) throw new Error('Atlantic.Net instance record is missing InstanceId');
  const status = mapStatus(record.vm_status ?? record.status);
  const sku = record.vm_plan_name ?? record.planname ?? record.plan_name;

  return {
    id,
    kind: isBareMetal({ plan_name: sku }) ? 'bare-metal' : 'cpu-vps',
    status,
    publicIp: firstNonEmpty(record.vm_ip_address, record.ip_address),
    createdAt: toIso(record.vm_created_date ?? record.created_date),
    hourlyRate: parseMoney(record.rate_per_hr),
    currency: 'USD',
    sku,
    region: record.vm_location,
    tags: record.vm_description ? [record.vm_description] : undefined,
  };
}

function mapStatus(value: string | undefined): Instance['status'] {
  const status = value?.toLowerCase();
  if (!status) return 'provisioning';
  if (status.includes('running') || status === 'active') return 'running';
  if (status.includes('stop') || status.includes('shutdown') || status === 'off') return 'stopped';
  if (status.includes('fail') || status.includes('error')) return 'failed';
  if (status.includes('terminat') || status.includes('remove') || status.includes('delete')) return 'destroyed';
  return 'provisioning';
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function planToQuote(plan: AtlanticPlan): Quote {
  const hourly = planHourly(plan);
  const monthly = parseMoney(plan.rate_per_month) || hourly * 730;
  return {
    hourly,
    monthly,
    currency: 'USD',
    provider: 'atlantic',
    sku: planName(plan),
    spot: false,
  };
}

function pickPlan(plans: AtlanticPlan[], spec: InstanceSpec): AtlanticPlan | null {
  let candidates = plans.filter(plan => {
    const hourly = planHourly(plan);
    return hourly > 0 && platformMatches(plan, DEFAULT_PLATFORM);
  });

  if (spec.kind === 'bare-metal') {
    candidates = candidates.filter(isBareMetal);
  } else {
    candidates = candidates.filter(plan => !isBareMetal(plan));
  }

  if (spec.cpu !== undefined) {
    candidates = candidates.filter(plan => planCpu(plan) >= spec.cpu!);
  }
  if (spec.memory !== undefined) {
    candidates = candidates.filter(plan => planMemoryGb(plan) >= spec.memory!);
  }
  if (spec.storage !== undefined) {
    candidates = candidates.filter(plan => planStorageGb(plan) >= spec.storage!);
  }
  if (spec.maxHourlyPrice !== undefined) {
    candidates = candidates.filter(plan => planHourly(plan) <= spec.maxHourlyPrice!);
  }

  candidates.sort((a, b) => planHourly(a) - planHourly(b));
  return candidates[0] ?? null;
}

function planName(plan: AtlanticPlan): string {
  const name = firstNonEmpty(plan.plan_name, plan.name, plan.display_name);
  if (!name) throw new Error('Atlantic.Net plan is missing plan_name');
  return name;
}

function planHourly(plan: AtlanticPlan): number {
  return parseMoney(firstNonEmpty(plan.rate_per_hr, plan.rate_per_hour, plan.price_per_hr));
}

function planCpu(plan: AtlanticPlan): number {
  return parseMoney(firstNonEmpty(plan.num_cpu, plan.cpu));
}

function planMemoryGb(plan: AtlanticPlan): number {
  return parseSizeGb(firstNonEmpty(plan.display_ram, plan.ram));
}

function planStorageGb(plan: AtlanticPlan): number {
  return parseSizeGb(firstNonEmpty(plan.display_disk, plan.disk));
}

function platformMatches(plan: AtlanticPlan, platform: string): boolean {
  const value = firstNonEmpty(plan.platform, plan.ostype)?.toLowerCase();
  return !value || value === platform || value.includes(platform);
}

function isBareMetal(plan: Pick<AtlanticPlan, 'plan_name' | 'name' | 'display_name' | 'plan_type'>): boolean {
  const text = [plan.plan_name, plan.name, plan.display_name, plan.plan_type].filter(Boolean).join(' ').toLowerCase();
  return text.includes('bare') || text.includes('metal') || text.includes('dedicated');
}

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseSizeGb(value: string | undefined): number {
  if (!value) return 0;
  const text = value.toLowerCase();
  const numeric = parseMoney(text);
  if (!Number.isFinite(numeric)) return 0;
  if (text.includes('tb')) return numeric * 1024;
  if (text.includes('mb')) return numeric / 1024;
  return numeric;
}

async function fetchPlans(ctx: AtlanticContext, config: Config): Promise<AtlanticPlan[]> {
  const result = await atlanticRequest(ctx, config, 'describe-plan');
  const plans = itemsFromSet<AtlanticPlan>(responseSet(result, 'describe-planresponse', 'plans'));
  if (!plans.length) {
    throw new Error('Atlantic.Net describe-plan returned no plans');
  }
  return plans;
}

async function pickDefaultImage(ctx: AtlanticContext, config: Config): Promise<string> {
  const result = await atlanticRequest(ctx, config, 'describe-image');
  const images = itemsFromSet<AtlanticImage>(responseSet(result, 'describe-imageresponse', 'imagesset'));
  const preferred = images
    .filter(image => (image.platform ?? image.ostype ?? '').toLowerCase().includes('linux'))
    .filter(image => (image.displayname ?? image.display_name ?? image.imageid ?? '').toLowerCase().includes('ubuntu'))
    .sort((a, b) => imageVersionScore(b) - imageVersionScore(a))[0];
  const imageId = preferred?.imageid ?? preferred?.image_id;
  if (!imageId) {
    throw new Error('Atlantic.Net describe-image returned no Ubuntu Linux image; set config.defaultImage or spec.image explicitly');
  }
  return imageId;
}

function imageVersionScore(image: AtlanticImage): number {
  for (const value of [image.version, image.displayname, image.display_name, image.imageid]) {
    const text = value?.toLowerCase();
    const version = text?.match(/ubuntu[-_\s]*(\d+(?:\.\d+)?)/)?.[1]
      ?? text?.match(/\b(\d{2}\.\d{2})\b/)?.[1];
    if (version) return Number(version);
  }
  return 0;
}

type AtlanticContext = {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
};

async function atlanticRequest(
  ctx: AtlanticContext,
  config: Config,
  action: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const { apiKey, secretKey } = requireCredentials(ctx, config);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rndguid = randomUUID();
  const signature = createHmac('sha256', secretKey)
    .update(`${timestamp}${rndguid}`)
    .digest('base64');

  const body = new URLSearchParams({
    Action: action,
    Format: 'json',
    Version: VERSION,
    ACSAccessKeyId: apiKey,
    Timestamp: timestamp,
    Rndguid: rndguid,
    Signature: signature,
    ...params,
  });

  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  const data = parseJson(text, response.statusText);
  if (!response.ok) {
    throw new Error(`Atlantic.Net ${action} failed: ${response.status} ${extractErrorMessage(data, response.statusText)}`);
  }
  const apiError = findApiError(data);
  if (apiError) {
    throw new Error(`Atlantic.Net ${action} failed: ${apiError}`);
  }
  return data;
}

function requireCredentials(ctx: AtlanticContext, config: Config): { apiKey: string; secretKey: string } {
  const apiKey = ctx.secret('ATLANTIC_API_KEY') ?? config.apiKey;
  const secretKey = ctx.secret('ATLANTIC_SECRET_KEY') ?? config.secretKey;
  if (!apiKey) throw new Error('ATLANTIC_API_KEY not in vault - `sh1pt secret set ATLANTIC_API_KEY` required');
  if (!secretKey) throw new Error('ATLANTIC_SECRET_KEY not in vault - `sh1pt secret set ATLANTIC_SECRET_KEY` required');
  return { apiKey, secretKey };
}

function parseJson(text: string, fallback: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch (error) {
    if (text) return { message: text };
    throw error instanceof Error ? error : new Error(fallback);
  }
}

function responseSet(data: unknown, responseKey: string, setKey: string): unknown {
  if (!isRecord(data)) return undefined;
  const response = data[responseKey];
  if (!isRecord(response)) return undefined;
  return response[setKey] ?? response.return;
}

function itemsFromSet<T>(set: unknown): T[] {
  if (!set) return [];
  if (Array.isArray(set)) return set;
  if (!isRecord(set)) return [set as T];

  const values: T[] = [];
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      values.push(...value as T[]);
    } else if (key === 'item' || key.endsWith('item')) {
      values.push(value as T);
    }
  }
  return values;
}

function firstItem<T>(set: unknown): T | undefined {
  return itemsFromSet<T>(set)[0];
}

function findApiError(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const error = data.error ?? data.Error ?? data.errors ?? data.Errors;
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    return extractErrorMessage(error, 'API error');
  }
  const response = Object.values(data).find(isRecord);
  if (response) {
    const candidate = response.error ?? response.Error;
    if (typeof candidate === 'string') return candidate;
    if (isRecord(candidate)) return extractErrorMessage(candidate, 'API error');
  }
  return null;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string') return data;
  if (!isRecord(data)) return fallback;
  const code = stringField(data, 'code') ?? stringField(data, 'Code');
  const message = stringField(data, 'message') ?? stringField(data, 'Message') ?? stringField(data, 'error') ?? stringField(data, 'Error');
  if (code && message) return `${code} ${message}`;
  return message ?? code ?? fallback;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find(value => value !== undefined && value.trim() !== '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildServerName(kind: InstanceSpec['kind']): string {
  return `sh1pt-${kind}-${Date.now()}`;
}
