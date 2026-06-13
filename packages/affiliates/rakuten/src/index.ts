import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  currency?: string;
  from?: string;
  trackingBaseUrl?: string;
  u1?: string;
}

const API_TOKEN_KEY = 'RAKUTEN_API_TOKEN';
const ENCRYPTED_ID_KEY = 'RAKUTEN_AFFILIATE_ID';
const DEFAULT_EVENTS_BASE = 'https://api.rakutenadvertising.com/events/1.0/transactions';
const DEFAULT_TRACKING_BASE = 'https://click.linksynergy.com/deeplink';

export default defineAffiliate<Config>({
  id: 'affiliate-rakuten',
  label: 'Rakuten Advertising',
  side: 'publisher',

  async connect(ctx, config) {
    const events = await rakutenGet(ctx, config, {
      limit: '1',
      transaction_date_start: config.from ?? defaultFrom(),
    });
    const firstEvent = collectItems(events)[0];
    return {
      accountId:
        config.accountId
        ?? ctx.secret(ENCRYPTED_ID_KEY)
        ?? stringField(firstEvent, ['sid', 'publisher_id'])
        ?? 'affiliate-rakuten',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`rakuten deep link · advertiser=${programId}`);
    const affiliateId = config.accountId ?? ctx.secret(ENCRYPTED_ID_KEY);
    if (!affiliateId) throw new Error('Rakuten accountId / encrypted affiliate ID is required');
    if (!destinationUrl) throw new Error('Rakuten destinationUrl is required');
    parseHttpUrl(destinationUrl, 'Rakuten destinationUrl');
    const url = new URL(config.trackingBaseUrl ?? DEFAULT_TRACKING_BASE);
    url.searchParams.set('id', affiliateId);
    url.searchParams.set('mid', programId);
    url.searchParams.set('murl', destinationUrl);
    if (config.u1) url.searchParams.set('u1', config.u1);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`rakuten events · advertiser=${programId}`);
    const data = await rakutenGet(ctx, config, {
      advertiser_id: programId,
      transaction_date_start: config.from ?? defaultFrom(),
      u1: config.u1,
    });
    const events = collectItems(data).filter((event) =>
      stringField(event, ['advertiser_id', 'mid']) === programId
      || !stringField(event, ['advertiser_id', 'mid'])
    );
    const sales = sumFields(events, ['sale_amount', 'sales_amount', 'saleAmount']);
    const commissions = sumFields(events, ['commissions', 'commission']);
    return {
      publishers: events.length > 0 ? 1 : 0,
      clicks: 0,
      conversions: events.length,
      revenue: sales,
      commissionsPaid: commissions,
      currency: firstString(events, ['currency']) ?? config.currency ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: API_TOKEN_KEY,
    label: 'Rakuten Advertising',
    vendorDocUrl: 'https://pubhelp.rakutenadvertising.com/hc/en-us/articles/5949867433997-Events-API',
    steps: [
      'Open the Rakuten Advertising Developer Portal and generate an API access token',
      'Paste the API access token below',
      `Store ${ENCRYPTED_ID_KEY} or set accountId for manual deep-link generation`,
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional Rakuten encrypted affiliate ID / tracking ID:',
      },
      {
        key: 'u1',
        message: 'Optional u1 tracking value for deep links and event reads:',
      },
    ],
  }),
});

type RakutenRecord = Record<string, unknown>;

async function rakutenGet(
  ctx: AffiliateConnectContext,
  config: Config,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const token = ctx.secret(API_TOKEN_KEY);
  if (!token) throw new Error(`${API_TOKEN_KEY} not in vault`);
  const affiliateId = config.accountId ?? ctx.secret(ENCRYPTED_ID_KEY);
  const url = new URL(config.baseUrl ?? DEFAULT_EVENTS_BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Rakuten ${res.status}: ${redact(text, token, affiliateId).slice(0, 200)}`);
  }
  return res.json();
}

function collectItems(data: unknown): RakutenRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ['data', 'events', 'transactions', 'items', 'results']) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is RakutenRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: RakutenRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: RakutenRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function sumFields(items: RakutenRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}

function numericField(item: RakutenRecord, keys: string[]): number {
  for (const key of keys) {
    const parsed = numericValue(item[key]);
    if (parsed) return parsed;
  }
  return 0;
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
