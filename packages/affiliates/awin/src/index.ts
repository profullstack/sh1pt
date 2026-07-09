import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  clickRef?: string;
  from?: string;
  region?: string;
  shorten?: boolean;
  timezone?: string;
  to?: string;
}

const DEFAULT_BASE = 'https://api.awin.com';
const DEFAULT_REGION = 'GB';
const DEFAULT_TIMEZONE = 'UTC';

export default defineAffiliate<Config>({
  id: 'affiliate-awin',
  label: 'Awin',
  side: 'publisher',

  async connect(ctx, config) {
    const accounts = await awinGet(ctx, config, '/accounts', { type: 'publisher' });
    const firstPublisher = collectItems(accounts, ['accounts']).find((account) =>
      stringField(account, ['accountType']) === 'publisher'
      || stringField(account, ['type']) === 'publisher'
    );
    return {
      accountId:
        config.accountId
        ?? stringField(firstPublisher, ['accountId', 'id'])
        ?? 'affiliate-awin',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`awin tracking link · advertiser=${programId}`);
    const publisherId = config.accountId;
    if (!publisherId) throw new Error('Awin accountId is required to build tracking links');
    const body: AwinRecord = {
      advertiserId: Number(programId),
      parameters: {},
      shorten: config.shorten ?? false,
    };
    if (destinationUrl) body.destinationUrl = destinationUrl;
    if (config.clickRef) body.parameters = { clickref: config.clickRef };
    const data = await awinPost(ctx, config, `/publishers/${encodeURIComponent(publisherId)}/linkbuilder/generate`, body);
    const record = asRecord(data);
    const url = stringField(record, ['url']);
    if (!url) throw new Error(`Awin returned no tracking URL for advertiser ${programId}`);
    return {
      url,
      shortUrl: stringField(record, ['shortUrl']),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`awin stats · advertiser=${programId}`);
    const publisherId = config.accountId;
    if (!publisherId) throw new Error('Awin accountId is required to read stats');
    const [report, transactions] = await Promise.all([
      awinGet(ctx, config, `/publishers/${encodeURIComponent(publisherId)}/reports/advertiser`, {
        startDate: config.from ?? defaultFrom(),
        endDate: config.to ?? today(),
        dateType: 'transaction',
        region: config.region ?? DEFAULT_REGION,
        timezone: config.timezone ?? DEFAULT_TIMEZONE,
      }),
      awinGet(ctx, config, `/publishers/${encodeURIComponent(publisherId)}/transactions/`, {
        startDate: `${config.from ?? defaultFrom()}T00:00:00`,
        endDate: `${config.to ?? today()}T23:59:59`,
        timezone: config.timezone ?? DEFAULT_TIMEZONE,
        dateType: 'transaction',
        advertiserId: programId,
      }),
    ]);
    const row = reportRows(report).find((item) => stringField(item, ['advertiserId']) === programId);
    const transactionRows = collectItems(transactions, ['transactions', 'data'])
      .filter((item) => stringField(item, ['advertiserId']) === programId);
    const conversions = numericField(row, ['totalNo', 'confirmedNo', 'pendingNo'])
      || transactionRows.length;
    const revenue = numericField(row, ['totalValue', 'confirmedValue', 'pendingValue'])
      || sumMoney(transactionRows, ['saleAmount', 'originalSaleAmount']);
    const commissions = numericField(row, ['totalComm', 'confirmedComm', 'pendingComm'])
      || sumMoney(transactionRows, ['commissionAmount']);
    return {
      publishers: 1,
      clicks: numericField(row, ['clicks']),
      conversions,
      revenue,
      commissionsPaid: commissions,
      currency:
        stringField(row, ['currency'])
        ?? firstMoneyCurrency(transactionRows, ['commissionAmount', 'saleAmount'])
        ?? 'GBP',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AWIN_API_TOKEN',
    label: 'Awin',
    vendorDocUrl: 'https://help.awin.com/apidocs/introduction-1',
    steps: [
      'Open the Awin UI and create an API token for the publisher account',
      'Paste the OAuth2 access token below',
      'Optionally set the publisher accountId if the token can access multiple accounts',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional Awin publisher account id:',
      },
      {
        key: 'region',
        message: 'Optional report region code (defaults to GB):',
      },
      {
        key: 'clickRef',
        message: 'Optional clickref to attach to generated tracking links:',
      },
    ],
  }),
});

type AwinRecord = Record<string, unknown>;

async function awinGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  return awinRequest(ctx, config, 'GET', path, query);
}

async function awinPost(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  body: AwinRecord,
): Promise<unknown> {
  return awinRequest(ctx, config, 'POST', path, {}, body);
}

async function awinRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, string> = {},
  body?: AwinRecord,
): Promise<unknown> {
  const token = ctx.secret('AWIN_API_TOKEN');
  if (!token) throw new Error('AWIN_API_TOKEN not in vault');
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  url.searchParams.set('accessToken', token);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Awin ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function reportRows(data: unknown): AwinRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  const record = asRecord(data);
  if (!record) return [];
  if (Array.isArray(record.body)) return record.body.filter(isRecord);
  const body = asRecord(record.body);
  if (body) {
    if (Array.isArray(body.data)) return body.data.filter(isRecord);
    if (Array.isArray(body.rows)) return body.rows.filter(isRecord);
    if (Array.isArray(body.advertisers)) return body.advertisers.filter(isRecord);
  }
  return collectItems(data, ['data', 'rows', 'advertisers']);
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

function collectItems(data: unknown, keys: string[]): AwinRecord[] {
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

function isRecord(value: unknown): value is AwinRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): AwinRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: AwinRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numericField(item: AwinRecord | undefined, keys: string[]): number {
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

function moneyValue(value: unknown): number {
  if (!isRecord(value)) return numericValue(value);
  return numericField(value, ['amount', 'value']);
}

function sumMoney(items: AwinRecord[], keys: string[]): number {
  return items.reduce((total, item) => {
    for (const key of keys) {
      const parsed = moneyValue(item[key]);
      if (parsed) return total + parsed;
    }
    return total;
  }, 0);
}

function firstMoneyCurrency(items: AwinRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    for (const key of keys) {
      const value = asRecord(item[key]);
      const currency = stringField(value, ['currency']);
      if (currency) return currency;
    }
  }
  return undefined;
}
