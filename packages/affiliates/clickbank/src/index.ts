import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  apiBase?: string;
  currency?: string;
  from?: string;
  page?: number;
  to?: string;
  trackingId?: string;
}

const DEFAULT_API_BASE = 'https://api.clickbank.com/rest/1.3';
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-clickbank',
  label: 'ClickBank',
  side: 'publisher',

  async connect(ctx, config) {
    const accounts = await clickbankGet(ctx, config, '/quickstats/accounts');
    const firstAccount = firstString(collectItems(accounts, ['accounts', 'account', 'nicknames', 'nickName']), [
      'nickName',
      'nickname',
      'account',
      'name',
    ]);
    return {
      accountId: config.accountId ?? firstAccount ?? 'affiliate-clickbank',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`clickbank hoplink · vendor=${programId}`);
    const affiliate = config.accountId;
    if (!affiliate) throw new Error('ClickBank accountId is required to build a HopLink');
    if (!programId) throw new Error('ClickBank vendor nickname is required to build a HopLink');
    return {
      url: withTrackingId(
        destinationUrl && isHopLink(destinationUrl)
          ? destinationUrl
          : `https://hop.clickbank.net/?affiliate=${encodeURIComponent(affiliate)}&vendor=${encodeURIComponent(programId)}`,
        config.trackingId,
      ),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`clickbank stats · vendor=${programId}`);
    const affiliate = config.accountId;
    if (!affiliate) throw new Error('ClickBank accountId is required to read affiliate stats');
    const query = orderQuery(config, affiliate, programId);
    const [countData, ordersData] = await Promise.all([
      clickbankGet(ctx, config, '/orders2/count', query),
      clickbankGet(ctx, config, '/orders2/list', query, { Page: String(config.page ?? 1) }),
    ]);
    const orders = collectItems(ordersData, ['orders', 'orderData', 'orderDatas', 'data']);
    const conversions = numericValue(countData) || numericField(asRecord(countData), ['count', 'total', 'orders']) || orders.length;
    const revenue = sumNumeric(orders, ['totalOrderAmount', 'transactionAmount', 'amount']);
    const commissions = sumNumeric(orders, ['affiliateCommission', 'commission', 'affiliateEarnings']);
    return {
      publishers: 1,
      clicks: 0,
      conversions,
      revenue,
      commissionsPaid: commissions || revenue,
      currency: firstString(orders, ['currency', 'currencyCode']) ?? config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLICKBANK_API_KEY',
    label: 'ClickBank',
    vendorDocUrl: 'https://support.clickbank.com/en/articles/10535397-clickbank-api-specifications',
    steps: [
      'Open the ClickBank primary account Settings -> API Management',
      'Create an API key with Order Read access for the affiliate nickname',
      'Paste the API key below; ClickBank no longer requires a Developer API key',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'ClickBank affiliate account nickname used in HopLinks:',
      },
      {
        key: 'trackingId',
        message: 'Optional ClickBank TID to append to HopLinks:',
      },
    ],
  }),
});

type ClickBankRecord = Record<string, unknown>;

async function clickbankGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
): Promise<unknown> {
  const apiKey = ctx.secret('CLICKBANK_API_KEY');
  if (!apiKey) throw new Error('CLICKBANK_API_KEY not in vault');
  const url = new URL(`${trimSlash(config.apiBase ?? DEFAULT_API_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      Authorization: apiKey,
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`ClickBank ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function orderQuery(config: Config, affiliate: string, vendor: string): Record<string, string> {
  const query: Record<string, string> = {
    role: 'AFFILIATE',
    type: 'SALE',
    affiliate,
    vendor,
  };
  if (config.from) query.startDate = config.from;
  if (config.to) query.endDate = config.to;
  if (config.trackingId) query.tid = config.trackingId;
  return query;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isHopLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'hop.clickbank.net' || url.hostname.endsWith('.hop.clickbank.net');
  } catch {
    return false;
  }
}

function withTrackingId(value: string, trackingId: string | undefined): string {
  if (!trackingId) return value;
  const sanitized = trackingId.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 100);
  if (!sanitized) return value;
  const url = new URL(value);
  if (!url.searchParams.has('tid')) url.searchParams.set('tid', sanitized);
  return url.toString();
}

function collectItems(data: unknown, keys: string[]): ClickBankRecord[] {
  if (Array.isArray(data)) return data.map(itemRecord).filter(isRecord);
  if (typeof data === 'string') return data.split(',').map((value) => ({ nickName: value.trim() })).filter((row) => row.nickName);
  if (!isRecord(data)) return [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value.map(itemRecord).filter(isRecord);
    if (typeof value === 'string') return value.split(',').map((entry) => ({ nickName: entry.trim() })).filter((row) => row.nickName);
  }
  if (Array.isArray(data.items)) return data.items.map(itemRecord).filter(isRecord);
  if (Array.isArray(data.data)) return data.data.map(itemRecord).filter(isRecord);
  return [data];
}

function itemRecord(value: unknown): unknown {
  return typeof value === 'string' ? { nickName: value } : value;
}

function isRecord(value: unknown): value is ClickBankRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): ClickBankRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: ClickBankRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: ClickBankRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function numericField(item: ClickBankRecord | undefined, keys: string[]): number {
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

function sumNumeric(items: ClickBankRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}
