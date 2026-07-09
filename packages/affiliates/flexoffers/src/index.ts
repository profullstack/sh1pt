import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  adjustmentType?: string;
  apiBase?: string;
  currency?: string;
  fobs?: string;
  fobs2?: string;
  fobs3?: string;
  fobs4?: string;
  fobs5?: string;
  foc?: string;
  fos?: string;
  fot?: string;
  from?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  statuses?: string[];
  to?: string;
  trackingBaseUrl?: string;
  useDeeplinkApi?: boolean;
}

type FlexOffersRecord = Record<string, unknown>;

const API_KEY = 'FLEXOFFERS_API_KEY';
const DEFAULT_API_BASE = 'https://api.flexoffers.com';
const DEFAULT_TRACKING_BASE = 'https://track.flexlinkspro.com/a.ashx';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_SALES_STATUSES = ['approved', 'pending'];

export default defineAffiliate<Config>({
  id: 'affiliate-flexoffers',
  label: 'FlexOffers',
  side: 'publisher',

  async connect(ctx, config) {
    const data = await flexoffersGet(ctx, config, '/advertisers', {
      ApplicationStatus: 'approved',
      ProgamStatus: 'approved',
      SortColumn: 'lastCommissionUpdated',
      SortOrder: 'DESC',
      Page: '1',
      pageSize: '1',
    });
    const advertiser = collectItems(data)[0];
    return {
      accountId:
        config.accountId
        ?? stringField(advertiser, ['domainID', 'domainId', 'publisherId', 'publisherID'])
        ?? 'affiliate-flexoffers',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`flexoffers deeplink · advertiser=${programId}`);
    if (!destinationUrl) throw new Error('FlexOffers destinationUrl is required');
    parseHttpUrl(destinationUrl, 'FlexOffers destinationUrl');

    if (config.useDeeplinkApi !== false) {
      const data = await flexoffersGet(ctx, config, '/deeplink', deeplinkQuery(programId, destinationUrl, config));
      const record = asRecord(data);
      const url = stringField(record, ['deeplink', 'deepLink', 'url', 'link']);
      if (!url) throw new Error(`FlexOffers returned no deeplink for advertiser ${programId}`);
      return { url };
    }

    return { url: buildTrackingLink(programId, destinationUrl, config) };
  },

  async stats(ctx, programId, config) {
    ctx.log(`flexoffers sales · advertiser=${programId}`);
    const statuses = config.statuses ?? (config.status ? [config.status] : DEFAULT_SALES_STATUSES);
    const responses = await Promise.all(statuses.map((status) =>
      flexoffersGet(ctx, config, '/allsales', salesQuery(programId, config, status)),
    ));
    const rows = responses.flatMap(collectItems);
    return {
      publishers: 1,
      clicks: sumFields(rows, ['clicks', 'clickCount']),
      conversions: conversionCount(rows),
      revenue: sumFields(rows, ['amount', 'saleAmount', 'salesAmount', 'orderAmount']),
      commissionsPaid: sumFields(rows, ['commission', 'commissionAmount', 'publisherCommission', 'payout']),
      currency: firstString(rows, ['currency', 'currencyCode']) ?? config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: API_KEY,
    label: 'FlexOffers',
    vendorDocUrl: 'https://www.flexoffers.com/publishers/web-service-api/',
    steps: [
      'Open Flex Apps -> Web Services in the FlexOffers Publisher Pro account',
      'Generate an API key for the approved domain and paste it below',
      'Optionally store the FlexOffers Domain ID as accountId for offline deep-link generation',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional FlexOffers Domain ID for manual deep links:',
      },
      {
        key: 'fobs',
        message: 'Optional first FlexOffers sub-tracking ID:',
      },
      {
        key: 'fobs2',
        message: 'Optional second FlexOffers sub-tracking ID:',
      },
    ],
  }),
});

async function flexoffersGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const token = ctx.secret(API_KEY);
  if (!token) throw new Error(`${API_KEY} not in vault`);
  const url = new URL(`${trimSlash(config.apiBase ?? DEFAULT_API_BASE)}${path}`);
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
    throw new Error(`FlexOffers ${res.status}: ${redact(text, token).slice(0, 200)}`);
  }
  return res.json();
}

function deeplinkQuery(programId: string, destinationUrl: string, config: Config): Record<string, string | undefined> {
  return {
    AdvertiserId: programId,
    URL: destinationUrl,
    fobs: config.fobs,
    fobs2: config.fobs2,
    fobs3: config.fobs3,
    fobs4: config.fobs4,
    fobs5: config.fobs5,
  };
}

function salesQuery(programId: string, config: Config, status: string): Record<string, string | undefined> {
  return {
    AdvertiserId: programId,
    reportType: 'details',
    Status: status,
    FromDate: config.from ?? defaultFrom(),
    ToDate: config.to ?? today(),
    Page: String(config.page ?? 1),
    pageSize: String(config.pageSize ?? 100),
    adjustmentType: config.adjustmentType,
  };
}

function buildTrackingLink(programId: string, destinationUrl: string, config: Config): string {
  const domainId = config.accountId;
  if (!domainId) throw new Error('FlexOffers accountId / Domain ID is required to build manual deep links');
  const url = new URL(config.trackingBaseUrl ?? DEFAULT_TRACKING_BASE);
  url.searchParams.set('foid', `${domainId}.A${programId}`);
  url.searchParams.set('foc', config.foc ?? '1');
  url.searchParams.set('fot', config.fot ?? '9999');
  url.searchParams.set('fos', config.fos ?? '1');
  url.searchParams.set('url', destinationUrl);
  for (const key of ['fobs', 'fobs2', 'fobs3', 'fobs4', 'fobs5'] as const) {
    if (config[key]) url.searchParams.set(key, config[key]);
  }
  return url.toString();
}

function collectItems(data: unknown): FlexOffersRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ['data', 'items', 'results', 'advertisers', 'sales', 'transactions']) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is FlexOffersRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): FlexOffersRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: FlexOffersRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: FlexOffersRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function conversionCount(rows: FlexOffersRecord[]): number {
  return sumFields(rows, ['conversions', 'conversionCount', 'salesCount']) || rows.length;
}

function sumFields(rows: FlexOffersRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + numericField(row, keys), 0);
}

function numericField(row: FlexOffersRecord, keys: string[]): number {
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

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
