import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  adId?: string;
  baseUrl?: string;
  clickRef?: string;
  clickRef2?: string;
  currency?: string;
  trackingBaseUrl?: string;
}

const DEFAULT_API_BASE = 'https://api.tradedoubler.com';
const DEFAULT_TRACKING_BASE = 'https://clk.tradedoubler.com';
const PRODUCT_TOKEN_KEY = 'TRADEDOUBLER_API_TOKEN';
const PUBLISHER_ID_KEY = 'TRADEDOUBLER_PUBLISHER_ID';

export default defineAffiliate<Config>({
  id: 'affiliate-tradedoubler',
  label: 'Tradedoubler',
  side: 'publisher',

  async connect(ctx, config) {
    const feeds = await tradedoublerGet(ctx, config, '/1.0/productFeeds.json');
    const firstFeed = collectItems(feeds, ['feeds'])[0];
    return {
      accountId:
        config.accountId
        ?? ctx.secret(PUBLISHER_ID_KEY)
        ?? stringField(firstFeed, ['siteId', 'publisherId'])
        ?? 'affiliate-tradedoubler',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`tradedoubler tracking link · program=${programId}`);
    const publisherId = config.accountId ?? ctx.secret(PUBLISHER_ID_KEY);
    if (!publisherId) throw new Error('Tradedoubler accountId / publisher id is required');
    if (!destinationUrl) throw new Error('Tradedoubler destinationUrl is required');
    try {
      new URL(destinationUrl);
    } catch {
      throw new Error('Tradedoubler destinationUrl must be an absolute URL');
    }
    const parts = [
      matrixPart('a', publisherId),
      matrixPart('p', programId),
    ];
    if (config.adId) parts.push(matrixPart('g', config.adId));
    if (config.clickRef) parts.push(matrixPart('epi', config.clickRef));
    if (config.clickRef2) parts.push(matrixPart('epi2', config.clickRef2));
    parts.push(matrixPart('url', destinationUrl, true));
    return {
      url: `${trimSlash(config.trackingBaseUrl ?? DEFAULT_TRACKING_BASE)}/click?${parts.join('')}`,
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`tradedoubler product-feed stats · program=${programId}`);
    const data = await tradedoublerGet(ctx, config, '/1.0/productFeeds.json', { programId });
    const feeds = collectItems(data, ['feeds']);
    const matchingFeeds = feeds.filter((feed) => feedMatchesProgram(feed, programId));
    const scopedFeeds = matchingFeeds.length > 0 ? matchingFeeds : feeds;
    return {
      publishers: scopedFeeds.length > 0 ? 1 : 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      commissionsPaid: 0,
      currency:
        firstString(scopedFeeds, ['currencyISOCode', 'currency'])
        ?? config.currency
        ?? 'EUR',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: PRODUCT_TOKEN_KEY,
    label: 'Tradedoubler',
    vendorDocUrl: 'https://dev.tradedoubler.com/products/publisher/',
    steps: [
      'Open the Tradedoubler publisher interface and create a Products API token',
      'Paste the Products API token below',
      'Optionally store TRADEDOUBLER_PUBLISHER_ID or set accountId for direct click tracking links',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional Tradedoubler publisher id used in click tracking URLs:',
      },
      {
        key: 'clickRef',
        message: 'Optional EPI value to attach to tracking links:',
      },
      {
        key: 'clickRef2',
        message: 'Optional EPI2 value to attach to tracking links:',
      },
    ],
  }),
});

type TdRecord = Record<string, unknown>;

async function tradedoublerGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  matrix: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const token = ctx.secret(PRODUCT_TOKEN_KEY);
  if (!token) throw new Error(`${PRODUCT_TOKEN_KEY} not in vault`);
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_API_BASE)}${withMatrix(path, matrix)}`);
  url.searchParams.set('token', token);
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tradedoubler ${res.status}: ${redact(text, token).slice(0, 200)}`);
  }
  return res.json();
}

function withMatrix(path: string, matrix: Record<string, string | number | undefined>): string {
  const suffix = Object.entries(matrix)
    .filter(([, value]) => value !== undefined && String(value).length > 0)
    .map(([key, value]) => `;${key}=${encodeURIComponent(String(value))}`)
    .join('');
  return `${path}${suffix}`;
}

function matrixPart(key: string, value: string, encodeFullUrl = false): string {
  return `${key}(${encodeFullUrl ? encodeURIComponent(value) : encodeMatrixValue(value)})`;
}

function encodeMatrixValue(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '/');
}

function feedMatchesProgram(feed: TdRecord, programId: string): boolean {
  if (stringField(feed, ['programId', 'id']) === programId) return true;
  const programs = feed.programs;
  if (!Array.isArray(programs)) return false;
  return programs
    .filter(isRecord)
    .some((program) => stringField(program, ['programId', 'id']) === programId);
}

function collectItems(data: unknown, keys: string[]): TdRecord[] {
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

function isRecord(value: unknown): value is TdRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: TdRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: TdRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
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
