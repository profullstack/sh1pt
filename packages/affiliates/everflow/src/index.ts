import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  currency?: string;
  from?: string;
  pageSize?: number;
  timezoneId?: number;
  to?: string;
  urlId?: number;
}

const DEFAULT_BASE = 'https://api.eflow.team/v1/affiliates';
const DEFAULT_TIMEZONE_ID = 67;
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-everflow',
  label: 'Everflow',
  side: 'publisher',

  async connect(ctx, config) {
    const offers = await everflowGet(ctx, config, '/offersrunnable', {
      page: '1',
      page_size: '1',
    });
    const first = collectItems(offers, ['offers'])[0];
    return {
      accountId:
        config.accountId
        ?? stringField(first, ['network_offer_id'])
        ?? 'affiliate-everflow',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`everflow tracking url · offer=${programId}`);
    const data = await everflowGet(
      ctx,
      config,
      `/offers/${encodeURIComponent(programId)}/url/${config.urlId ?? 0}`,
    );
    const url = stringField(asRecord(data), ['url']) ?? await findRunnableTrackingUrl(ctx, config, programId);
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error(`Everflow returned no tracking URL for offer ${programId}`);
    }
    return {
      url: withFallbackDestination(url, destinationUrl),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`everflow stats · offer=${programId}`);
    const [table, conversions] = await Promise.all([
      everflowPost(ctx, config, '/reporting/entity/table', reportingTableBody(config)),
      everflowPost(ctx, config, '/reporting/conversions', conversionSearchBody(config)),
    ]);
    const offerRow = collectItems(table, ['table']).find((row) => rowMatchesOffer(row, programId));
    const reporting = asRecord(offerRow?.reporting);
    const conversionItems = collectItems(conversions, ['conversions'])
      .filter((conversion) => conversionMatchesOffer(conversion, programId));
    const currency =
      firstString(conversionItems, ['currency_id'])
      ?? config.currency
      ?? DEFAULT_CURRENCY;

    return {
      publishers: 1,
      clicks: numericField(reporting, ['total_click', 'unique_click']),
      conversions: conversionItems.length || numericField(reporting, ['cv']),
      revenue: sumNumeric(conversionItems, ['sale_amount']),
      commissionsPaid: sumNumeric(conversionItems, ['revenue']) || numericField(reporting, ['revenue']),
      currency,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'EVERFLOW_API_KEY',
    label: 'Everflow',
    vendorDocUrl: 'https://developers.everflow.io/api-reference/affiliate-overview',
    steps: [
      'Open the Everflow Affiliate Portal and go to My Account -> API',
      'Create or copy an Affiliate API key',
      'Paste the API key below; sh1pt stores it in the vault',
    ],
    fields: [
      {
        key: 'timezoneId',
        message: 'Optional Everflow timezone id for reporting (defaults to 67):',
      },
      {
        key: 'currency',
        message: 'Optional reporting currency code (defaults to USD):',
      },
    ],
  }),
});

type EverflowRecord = Record<string, unknown>;

async function findRunnableTrackingUrl(
  ctx: AffiliateConnectContext,
  config: Config,
  programId: string,
): Promise<string | undefined> {
  const offers = await everflowGet(ctx, config, '/offersrunnable', {
    page: '1',
    page_size: String(config.pageSize ?? 50),
  });
  const match = collectItems(offers, ['offers']).find((offer) =>
    stringField(offer, ['network_offer_id']) === programId,
  );
  return stringField(match, ['tracking_url', 'redirect_tracking_url']);
}

async function everflowGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  return everflowRequest(ctx, config, 'GET', path, query);
}

async function everflowPost(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  body: EverflowRecord,
): Promise<unknown> {
  return everflowRequest(ctx, config, 'POST', path, {}, body);
}

async function everflowRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, string> = {},
  body?: EverflowRecord,
): Promise<unknown> {
  const apiKey = ctx.secret('EVERFLOW_API_KEY');
  if (!apiKey) throw new Error('EVERFLOW_API_KEY not in vault');
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Eflow-Api-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Everflow ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function reportingTableBody(config: Config): EverflowRecord {
  return {
    from: config.from ?? defaultFrom(),
    to: config.to ?? today(),
    timezone_id: config.timezoneId ?? DEFAULT_TIMEZONE_ID,
    currency_id: config.currency ?? DEFAULT_CURRENCY,
    columns: [{ column: 'offer' }],
    query: { filters: [] },
  };
}

function conversionSearchBody(config: Config): EverflowRecord {
  return {
    from: config.from ?? defaultFrom(),
    to: config.to ?? today(),
    timezone_id: config.timezoneId ?? DEFAULT_TIMEZONE_ID,
    show_conversions: true,
    show_events: true,
    query: { filters: [] },
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function collectItems(data: unknown, keys: string[]): EverflowRecord[] {
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

function isRecord(value: unknown): value is EverflowRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): EverflowRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: EverflowRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: EverflowRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function numericField(item: EverflowRecord | undefined, keys: string[]): number {
  if (!item) return 0;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function sumNumeric(items: EverflowRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}

function rowMatchesOffer(row: EverflowRecord, programId: string): boolean {
  return collectItems(row.columns, []).some((column) => stringField(column, ['id']) === programId);
}

function conversionMatchesOffer(conversion: EverflowRecord, programId: string): boolean {
  const relationship = asRecord(conversion.relationship);
  const offer = asRecord(relationship?.offer);
  return stringField(offer, ['network_offer_id']) === programId;
}

function withFallbackDestination(url: string, destinationUrl: string): string {
  if (!destinationUrl) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('url')) parsed.searchParams.set('url', destinationUrl);
    return parsed.toString();
  } catch {
    return url;
  }
}
