import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type ScaleInstanceStatus = 'provisioning' | 'running' | 'stopped' | 'failed' | 'destroyed';

export interface ScaleInstance {
  id: string;
  provider?: string;
  status: ScaleInstanceStatus;
  publicIp?: string;
  privateIp?: string;
  region?: string;
  sku?: string;
  hourlyRate?: number;
  currency?: string;
  tags?: string[];
}

export interface ScaleDnsRecord {
  type?: string;
  name: string;
  value: string;
  weight?: number;
}

export interface ScaleDnsEntry {
  provider?: string;
  domain: string;
  ttl?: number;
  records?: ScaleDnsRecord[];
}

export interface ScaleAutoRule {
  min: number;
  max: number;
  targetCpu?: number;
  cooldown?: number;
}

export interface ScaleState {
  instances: ScaleInstance[];
  dns: ScaleDnsEntry[];
  autoRules: ScaleAutoRule | null;
}

export interface ScaleCostSummary {
  hourly: number;
  monthly: number;
  currency: string;
  byProvider: Record<string, { hourly: number; monthly: number; instances: number }>;
  suggestions: string[];
}

const DEFAULT_SCALE_STATE = '.sh1pt/scale.json';
const HOURS_PER_MONTH = 730;

export async function loadScaleState(path = DEFAULT_SCALE_STATE): Promise<ScaleState> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ScaleState>;
    return normalizeScaleState(parsed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { instances: [], dns: [], autoRules: null };
    throw error;
  }
}

export function summarizeScaleCost(state: ScaleState): ScaleCostSummary {
  const active = state.instances.filter((instance) => !['destroyed', 'failed'].includes(instance.status));
  const currencies = new Set(active.map((instance) => instance.currency ?? 'USD'));
  const currency = currencies.size === 1 ? ([...currencies][0] ?? 'USD') : 'MIXED';
  const byProvider: ScaleCostSummary['byProvider'] = {};
  let hourly = 0;

  for (const instance of active) {
    const provider = instance.provider ?? 'unknown';
    const rate = instance.hourlyRate ?? 0;
    hourly += rate;
    byProvider[provider] ??= { hourly: 0, monthly: 0, instances: 0 };
    byProvider[provider].hourly += rate;
    byProvider[provider].monthly = roundMoney(byProvider[provider].hourly * HOURS_PER_MONTH);
    byProvider[provider].instances += 1;
  }

  const suggestions: string[] = [];
  const stoppedPaid = active.filter((instance) => instance.status === 'stopped' && (instance.hourlyRate ?? 0) > 0);
  if (stoppedPaid.length > 0) {
    suggestions.push(`destroy or resize ${stoppedPaid.length} stopped paid instance(s)`);
  }
  const missingRates = active.filter((instance) => instance.hourlyRate === undefined);
  if (missingRates.length > 0) {
    suggestions.push(`add hourlyRate to ${missingRates.length} instance(s) for complete cost reporting`);
  }
  if (currency === 'MIXED') {
    suggestions.push('normalize instance currencies before comparing total spend');
  }

  return {
    hourly: roundMoney(hourly),
    monthly: roundMoney(hourly * HOURS_PER_MONTH),
    currency,
    byProvider,
    suggestions,
  };
}

export function summarizeScaleStatus(state: ScaleState) {
  const byStatus = state.instances.reduce<Record<string, number>>((counts, instance) => {
    counts[instance.status] = (counts[instance.status] ?? 0) + 1;
    return counts;
  }, {});
  const publicIps = state.instances.flatMap((instance) => instance.publicIp ? [instance.publicIp] : []);

  return {
    instances: state.instances,
    byStatus,
    publicIps,
    dns: state.dns,
    autoRules: state.autoRules,
  };
}

function normalizeScaleState(input: Partial<ScaleState>): ScaleState {
  return {
    instances: Array.isArray(input.instances) ? input.instances.map(normalizeInstance) : [],
    dns: Array.isArray(input.dns) ? input.dns.map(normalizeDnsEntry) : [],
    autoRules: input.autoRules ?? null,
  };
}

function normalizeInstance(input: Partial<ScaleInstance>): ScaleInstance {
  return {
    id: String(input.id ?? 'unknown'),
    provider: input.provider,
    status: input.status ?? 'running',
    publicIp: input.publicIp,
    privateIp: input.privateIp,
    region: input.region,
    sku: input.sku,
    hourlyRate: typeof input.hourlyRate === 'number' ? input.hourlyRate : undefined,
    currency: input.currency,
    tags: input.tags,
  };
}

function normalizeDnsEntry(input: Partial<ScaleDnsEntry>): ScaleDnsEntry {
  return {
    provider: input.provider,
    domain: String(input.domain ?? 'unknown'),
    ttl: input.ttl,
    records: Array.isArray(input.records) ? input.records.map((record) => ({
      type: record.type,
      name: record.name,
      value: record.value,
      weight: record.weight,
    })) : [],
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
