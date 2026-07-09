import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  affiliateLink?: string;
  apiBase?: string;
  currency?: string;
  includeVendorTransactions?: boolean;
  paykey?: string;
  trackingId?: string;
}

type JVZooRecord = Record<string, unknown>;

const API_KEY = 'JVZOO_API_KEY';
const DEFAULT_API_BASE = 'https://api.jvzoo.com/v2.0';
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-jvzoo',
  label: 'JVZoo',
  side: 'publisher',

  async connect(ctx, config) {
    const data = await jvzooGet(ctx, config, affiliateTransactionsPath(config.paykey));
    const first = collectItems(data)[0];
    return {
      accountId:
        config.accountId
        ?? stringField(first, ['affiliate_id', 'affiliateId', 'affiliate', 'affiliate_username'])
        ?? 'affiliate-jvzoo',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`jvzoo affiliate link · product=${programId}`);
    const baseLink = config.affiliateLink ?? (isJVZooAffiliateLink(destinationUrl) ? destinationUrl : undefined);
    const url = baseLink
      ? new URL(baseLink)
      : manualAffiliateUrl(programId, config);
    applyTrackingId(url, config.trackingId);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`jvzoo transactions · product=${programId}`);
    const responses = await Promise.all([
      jvzooGet(ctx, config, affiliateTransactionsPath(config.paykey)),
      ...(config.includeVendorTransactions
        ? [jvzooGet(ctx, config, vendorTransactionsPath(config.paykey))]
        : []),
    ]);
    const rows = responses.flatMap(collectItems)
      .filter((row) => matchesProgram(row, programId));
    return {
      publishers: 1,
      clicks: 0,
      conversions: rows.length,
      revenue: sumFields(rows, ['amount', 'transaction_amount', 'sale_amount', 'ctransamount', 'price']),
      commissionsPaid: sumFields(rows, ['commission', 'affiliate_commission', 'affiliateCommission', 'payout']),
      currency: firstString(rows, ['currency', 'currency_code', 'ccurrency']) ?? config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: API_KEY,
    label: 'JVZoo',
    vendorDocUrl: 'https://api.jvzoo.com/docs/',
    steps: [
      'Create a JVZoo API Application from My Account -> Applications',
      'Paste the API key below; JVZoo API v2 authenticates with the key as Basic Auth username and x as password',
      'Optionally store accountId as your JVZoo affiliate ID and trackingId for generated /c/{affiliate}/{product}/ links',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional JVZoo affiliate ID used in generated /c/{affiliate}/{product}/ links:',
      },
      {
        key: 'affiliateLink',
        message: 'Optional approved JVZoo affiliate link to append tracking IDs to:',
      },
      {
        key: 'trackingId',
        message: 'Optional JVZoo TID, lowercase alphanumeric up to 24 characters:',
      },
    ],
  }),
});

async function jvzooGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
): Promise<unknown> {
  const apiKey = ctx.secret(API_KEY);
  if (!apiKey) throw new Error(`${API_KEY} not in vault`);
  const url = new URL(`${trimSlash(config.apiBase ?? DEFAULT_API_BASE)}${path}`);
  const auth = Buffer.from(`${apiKey}:x`).toString('base64');
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Basic ${auth}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JVZoo ${res.status}: ${redact(text, apiKey, auth).slice(0, 200)}`);
  }
  return res.json();
}

function affiliateTransactionsPath(paykey: string | undefined): string {
  return `/latest-affiliates-transactions${paykey ? `/${encodeURIComponent(paykey)}` : ''}`;
}

function vendorTransactionsPath(paykey: string | undefined): string {
  return `/latest-transactions${paykey ? `/${encodeURIComponent(paykey)}` : ''}`;
}

function manualAffiliateUrl(programId: string, config: Config): URL {
  if (!config.accountId) throw new Error('JVZoo accountId / affiliate ID is required to generate affiliate links');
  if (!programId) throw new Error('JVZoo product id is required to generate affiliate links');
  return new URL(
    `https://www.jvzoo.com/c/${encodeURIComponent(config.accountId)}/${encodeURIComponent(programId)}/`,
  );
}

function isJVZooAffiliateLink(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.hostname === 'www.jvzoo.com' || url.hostname === 'jvzoo.com')
      && /^\/c\/[^/]+\/[^/]+\/?/.test(url.pathname);
  } catch {
    return false;
  }
}

function applyTrackingId(url: URL, trackingId: string | undefined): void {
  const tid = trackingId?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  if (tid && !url.searchParams.has('tid')) url.searchParams.set('tid', tid);
}

function collectItems(data: unknown): JVZooRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ['results', 'data', 'transactions', 'items']) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is JVZooRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: JVZooRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: JVZooRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function matchesProgram(row: JVZooRecord, programId: string): boolean {
  if (!programId) return true;
  const value = stringField(row, ['product_id', 'productId', 'product', 'cproditem', 'item_id', 'itemId']);
  return value === programId || value === undefined;
}

function sumFields(rows: JVZooRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + numericField(row, keys), 0);
}

function numericField(row: JVZooRecord, keys: string[]): number {
  for (const key of keys) {
    const parsed = numericValue(row[key]);
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

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
