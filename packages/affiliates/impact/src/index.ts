import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  adId?: string;
  baseUrl?: string;
  currency?: string;
  customPath?: string;
  from?: string;
  linkType?: string;
  mediaPartnerPropertyId?: string;
  pageSize?: number;
  sharedId?: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  to?: string;
}

type ImpactRecord = Record<string, unknown>;

const DEFAULT_BASE = 'https://api.impact.com';
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-impact',
  label: 'Impact (impact.com)',
  side: 'publisher',

  async connect(ctx, config) {
    const { accountSid } = requireAuth(ctx, config);
    await impactRequest(ctx, config, 'GET', `/Mediapartners/${encodeURIComponent(accountSid)}/CompanyInformation`);
    return { accountId: accountSid };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`impact tracking link - program=${programId}`);
    const { accountSid } = requireAuth(ctx, config);
    const query = trackingLinkQuery(destinationUrl, config);
    const data = await impactRequest(
      ctx,
      config,
      'POST',
      `/Mediapartners/${encodeURIComponent(accountSid)}/Programs/${encodeURIComponent(programId)}/TrackingLinks`,
      query,
    );
    const record = asRecord(data);
    const url = stringField(record, ['TrackingURL', 'TrackingUrl', 'TrackingLink', 'Url', 'url']);
    if (!url) throw new Error(`Impact returned no tracking URL for program ${programId}`);
    return { url };
  },

  async stats(ctx, programId, config) {
    ctx.log(`impact action stats - program=${programId}`);
    const { accountSid } = requireAuth(ctx, config);
    const data = await impactRequest(
      ctx,
      config,
      'GET',
      `/Mediapartners/${encodeURIComponent(accountSid)}/Actions`,
      {
        CampaignId: programId,
        StartDate: impactDate(config.from ?? daysAgo(30), false),
        EndDate: impactDate(config.to ?? today(), true),
        PageSize: String(config.pageSize ?? 100),
      },
    );

    const rows = collectItems(data, ['Actions', 'actions', 'data', 'results'])
      .filter((row) => stringField(row, ['CampaignId', 'ProgramId']) === programId);
    const payableRows = rows.filter((row) => stringField(row, ['State'])?.toUpperCase() !== 'REVERSED');
    const approvedRows = payableRows.filter((row) =>
      stringField(row, ['State'])?.toUpperCase() === 'APPROVED'
      || Boolean(stringField(row, ['ClearedDate'])),
    );
    const payoutRows = approvedRows.length > 0 ? approvedRows : payableRows;

    return {
      publishers: 1,
      clicks: 0,
      conversions: payableRows.length,
      revenue: sumFields(payableRows, ['Amount', 'DeltaAmount', 'IntendedAmount']),
      commissionsPaid: sumFields(payoutRows, ['Payout', 'DeltaPayout', 'IntendedPayout']),
      currency: firstCurrency(payableRows) ?? config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'IMPACT_AUTH_TOKEN',
    label: 'Impact (impact.com)',
    vendorDocUrl: 'https://integrations.impact.com/impact-publisher/reference/authentication',
    steps: [
      'Open impact.com Settings -> API to find the Account SID and Auth Token',
      'Paste the Auth Token below; sh1pt encrypts it in the vault',
      'Set accountId to the Account SID and optional mediaPartnerPropertyId/subId fields for link creation',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Impact Account SID for publisher API requests:',
      },
      {
        key: 'mediaPartnerPropertyId',
        message: 'Optional Impact Media Partner Property ID for generated tracking links:',
      },
      {
        key: 'subId1',
        message: 'Optional SubId1 value to attach to generated tracking links:',
      },
      {
        key: 'sharedId',
        message: 'Optional SharedId value to attach to generated tracking links:',
      },
    ],
  }),
});

function trackingLinkQuery(destinationUrl: string, config: Config): Record<string, string> {
  const query: Record<string, string> = {
    Type: config.linkType ?? (config.customPath ? 'Vanity' : 'Regular'),
  };
  if (destinationUrl) query.DeepLink = destinationUrl;
  if (config.adId) query.AdId = config.adId;
  if (config.customPath) query.CustomPath = config.customPath;
  if (config.mediaPartnerPropertyId) query.MediaPartnerPropertyId = config.mediaPartnerPropertyId;
  for (const key of ['subId1', 'subId2', 'subId3', 'sharedId'] as const) {
    if (config[key]) query[key] = config[key];
  }
  return query;
}

async function impactRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const { accountSid, token } = requireAuth(ctx, config);
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      authorization: basicAuth(accountSid, token),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Impact ${res.status}: ${redact(text, accountSid, token).slice(0, 200)}`);
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function requireAuth(ctx: AffiliateConnectContext, config: Config): { accountSid: string; token: string } {
  const accountSid = config.accountId ?? ctx.secret('IMPACT_ACCOUNT_SID');
  if (!accountSid) throw new Error('Impact accountId / Account SID is required');
  const token = ctx.secret('IMPACT_AUTH_TOKEN');
  if (!token) throw new Error('IMPACT_AUTH_TOKEN not in vault');
  return { accountSid, token };
}

function basicAuth(accountSid: string, token: string): string {
  return `Basic ${base64Ascii(`${accountSid}:${token}`)}`;
}

function base64Ascii(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index) & 0xff;
    const hasSecond = index + 1 < value.length;
    const hasThird = index + 2 < value.length;
    const second = hasSecond ? value.charCodeAt(index + 1) & 0xff : 0;
    const third = hasThird ? value.charCodeAt(index + 2) & 0xff : 0;
    output += alphabet.charAt(first >> 2);
    output += alphabet.charAt(((first & 3) << 4) | (second >> 4));
    output += hasSecond ? alphabet.charAt(((second & 15) << 2) | (third >> 6)) : '=';
    output += hasThird ? alphabet.charAt(third & 63) : '=';
  }
  return output;
}

function impactDate(value: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function collectItems(data: unknown, keys: string[]): ImpactRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is ImpactRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): ImpactRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: ImpactRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function sumFields(rows: ImpactRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + keys.reduce((sum, key) => sum + numericValue(row[key]), 0), 0);
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstCurrency(rows: ImpactRecord[]): string | undefined {
  for (const row of rows) {
    const currency = stringField(row, ['Currency', 'PayoutCurrency', 'AmountCurrency']);
    if (currency) return currency;
  }
  return undefined;
}

function redact(value: string, accountSid: string, token: string): string {
  return value
    .replaceAll(accountSid, '[redacted]')
    .replaceAll(token, '[redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/=]{12,}/g, 'Basic [redacted]');
}
