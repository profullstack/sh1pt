import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  apiKey?: string;
  baseUrl?: string;
  bidFloor?: string;
  campaignSearch?: string;
  clickRef?: string;
  country?: string;
  currency?: string;
  fallbackUrl?: string;
  from?: string;
  linkBaseUrl?: string;
  merchantGroupIds?: string;
  programType?: 'CPA' | 'CPC';
  reportsBaseUrl?: string;
  to?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
}

const SECRET_KEY = 'SOVRN_SECRET_KEY';
const LEGACY_SECRET_KEY = 'SOVRN_AUTH_KEY';
const COMMERCE_API_KEY = 'SOVRN_COMMERCE_API_KEY';
const LEGACY_API_KEY = 'SOVRN_API_KEY';
const DEFAULT_REST_BASE = 'https://rest.viglink.com/api';
const DEFAULT_REPORTS_BASE = 'https://viglink.io/v1';
const DEFAULT_LINK_BASE = 'https://sovrn.co';

export default defineAffiliate<Config>({
  id: 'affiliate-sovrn',
  label: 'Sovrn Commerce (VigLink)',
  side: 'publisher',

  async connect(ctx, config) {
    const data = await sovrnGet(ctx, config, 'rest', `/account/campaigns/${encodeURIComponent(config.campaignSearch ?? 'PRIMARY')}`, {
      format: 'json',
      rowsPerPage: '100',
    });
    const campaigns = collectItems(data, ['campaigns']);
    const selected = campaigns.find((campaign) =>
      stringField(campaign, ['campaignId']) === config.accountId
      || stringField(campaign, ['name']) === config.accountId
    ) ?? campaigns[0];
    return {
      accountId:
        config.accountId
        ?? stringField(selected, ['campaignId', 'name'])
        ?? 'affiliate-sovrn',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`sovrn tracking link · campaign=${programId}`);
    const key = commerceKey(ctx, config);
    if (!destinationUrl) throw new Error('Sovrn destinationUrl is required');
    parseHttpUrl(destinationUrl, 'Sovrn destinationUrl');
    const url = new URL(trimSlash(config.linkBaseUrl ?? DEFAULT_LINK_BASE));
    url.searchParams.set('key', key);
    url.searchParams.set('u', destinationUrl);
    setOptional(url, 'cuid', config.clickRef);
    setOptional(url, 'utm_source', config.utmSource);
    setOptional(url, 'utm_medium', config.utmMedium);
    setOptional(url, 'utm_campaign', config.utmCampaign);
    setOptional(url, 'utm_term', config.utmTerm);
    setOptional(url, 'utm_content', config.utmContent);
    setOptional(url, 'bf', config.bidFloor);
    setOptional(url, 'fbu', config.fallbackUrl);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`sovrn link stats · campaign=${programId}`);
    const data = await sovrnGet(ctx, config, 'reports', '/reports/links', {
      clickDateStart: config.from ?? defaultFrom(),
      clickDateEnd: config.to ?? tomorrow(),
      campaignIds: programId,
      merchantGroupIds: config.merchantGroupIds,
      cuids: config.clickRef,
      programType: config.programType,
      country: config.country,
    });
    const totals = asRecord(asRecord(data)?.totals);
    const rows = collectItems(data, ['data']);
    const revenue = numericField(totals, ['revenueTotal']) || sumFields(rows, ['revenue']);
    const clicks = numericField(totals, ['clicksTotal']) || sumFields(rows, ['clicks']);
    const sales = numericField(totals, ['salesTotal']) || sumFields(rows, ['sales']);
    const actions = numericField(totals, ['actionsTotal']) || sumFields(rows, ['actions']);
    return {
      publishers: 1,
      clicks,
      conversions: sales || actions,
      revenue,
      commissionsPaid: revenue,
      currency: config.currency ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Sovrn Commerce (VigLink)',
    vendorDocUrl: 'https://developer.sovrn.com/docs/authorization',
    steps: [
      'Open Sovrn Platform → Commerce Settings and generate a site Secret Key for reports',
      'Paste the Secret Key below',
      'For link wrapping, also store SOVRN_COMMERCE_API_KEY or set apiKey from the site API key',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional Sovrn campaign id/name to prefer during connect:',
      },
      {
        key: 'apiKey',
        message: 'Optional Commerce API key used in wrapped affiliate links:',
      },
      {
        key: 'clickRef',
        message: 'Optional CUID value for link/report tracking:',
      },
    ],
  }),
});

type SovrnRecord = Record<string, unknown>;

async function sovrnGet(
  ctx: AffiliateConnectContext,
  config: Config,
  service: 'reports' | 'rest',
  path: string,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const secret = reportSecret(ctx);
  const base = service === 'reports'
    ? config.reportsBaseUrl ?? DEFAULT_REPORTS_BASE
    : config.baseUrl ?? DEFAULT_REST_BASE;
  const url = new URL(`${trimSlash(base)}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `secret ${secret}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sovrn ${res.status}: ${redact(text, secret, config.apiKey).slice(0, 200)}`);
  }
  return res.json();
}

function reportSecret(ctx: AffiliateConnectContext): string {
  const secret = ctx.secret(SECRET_KEY) ?? ctx.secret(LEGACY_SECRET_KEY);
  if (!secret) throw new Error(`${SECRET_KEY} not in vault`);
  return secret;
}

function commerceKey(ctx: AffiliateConnectContext, config: Config): string {
  const key = config.apiKey ?? ctx.secret(COMMERCE_API_KEY) ?? ctx.secret(LEGACY_API_KEY);
  if (!key) throw new Error('Sovrn Commerce API key is required to build affiliate links');
  return key;
}

function setOptional(url: URL, key: string, value: string | undefined): void {
  if (value) url.searchParams.set(key, value);
}

function collectItems(data: unknown, keys: string[]): SovrnRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  return [data];
}

function isRecord(value: unknown): value is SovrnRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): SovrnRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: SovrnRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numericField(item: SovrnRecord | undefined, keys: string[]): number {
  if (!item) return 0;
  for (const key of keys) {
    const parsed = numericValue(item[key]);
    if (parsed) return parsed;
  }
  return 0;
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sumFields(items: SovrnRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
