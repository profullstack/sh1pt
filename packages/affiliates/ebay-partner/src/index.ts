import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  campaignId?: string;
  channelId?: string;
  checkoutSite?: string;
  currency?: string;
  customId?: string;
  eventType?: string;
  from?: string;
  priorityListingPayload?: string;
  rotationId?: string;
  to?: string;
  toolId?: string;
}

type EbayRecord = Record<string, unknown>;

const DEFAULT_BASE = 'https://api.partner.ebay.com';
const DEFAULT_CHANNEL_ID = '1';
const DEFAULT_CHECKOUT_SITE = '0';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_EVENT_TYPE = '1';
const DEFAULT_ROTATION_ID = '711-53200-19255-0';
const DEFAULT_TOOL_ID = '10001';

export default defineAffiliate<Config>({
  id: 'affiliate-ebay-partner',
  label: 'eBay Partner Network',
  side: 'publisher',

  async connect(ctx, config) {
    const { accountSid } = requireReportingAuth(ctx, config);
    await ebayReport(ctx, config, 'ebay_partner_perf_by_day', {
      CAMPAIGN_ID: config.campaignId ?? '0',
      CHECKOUT_SITE: config.checkoutSite ?? DEFAULT_CHECKOUT_SITE,
      START_DATE: config.from ?? daysAgo(1),
      END_DATE: config.to ?? today(),
    });
    return { accountId: accountSid };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`ebay partner tracking link - campaign=${programId}`);
    const campaignId = programId || config.campaignId;
    if (!campaignId) throw new Error('eBay Partner campaignId is required to build tracking links');
    if (!destinationUrl) throw new Error('eBay Partner destinationUrl is required to build tracking links');

    const url = parseHttpUrl(destinationUrl, 'eBay Partner destinationUrl');

    url.searchParams.set('mkevt', config.eventType ?? DEFAULT_EVENT_TYPE);
    url.searchParams.set('mkcid', config.channelId ?? DEFAULT_CHANNEL_ID);
    url.searchParams.set('mkrid', config.rotationId ?? DEFAULT_ROTATION_ID);
    url.searchParams.set('campid', campaignId);
    url.searchParams.set('toolid', config.toolId ?? DEFAULT_TOOL_ID);
    if (config.customId) url.searchParams.set('customid', config.customId);
    if (config.priorityListingPayload) url.searchParams.set('amdata', config.priorityListingPayload);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`ebay partner reporting - campaign=${programId}`);
    const campaignId = programId || config.campaignId || '0';
    const data = await ebayReport(ctx, config, 'ebay_partner_perf_by_campaign', {
      CAMPAIGN_ID: campaignId,
      CHECKOUT_SITE: config.checkoutSite ?? DEFAULT_CHECKOUT_SITE,
      START_DATE: config.from ?? daysAgo(30),
      END_DATE: config.to ?? today(),
    });
    const allRows = collectItems(data, ['data', 'rows', 'reports', 'records', 'Records']);
    const rows = campaignId === '0'
      ? allRows
      : allRows.filter((row) => stringField(row, ['CampaignId', 'CampaignID', 'Campaign Id']) === campaignId);
    const sourceRows = rows.length > 0 ? rows : allRows;
    return {
      publishers: 1,
      clicks: sumFields(sourceRows, ['Clicks']),
      conversions: sumFields(sourceRows, ['Transactions', 'ItemsOrdered']),
      revenue: sumFields(sourceRows, ['Sales']),
      commissionsPaid: sumFields(sourceRows, ['Earnings', 'OtherEarnings']),
      currency: config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'EBAY_EPN_AUTH_TOKEN',
    label: 'eBay Partner Network',
    vendorDocUrl: 'https://developer.ebay.com/api-docs/buy/static/ref-epn-link.html',
    steps: [
      'Enable API access in the eBay Partner Network portal and copy the Account SID/Auth Token',
      'Paste the Auth Token below; sh1pt encrypts it in the vault',
      'Set accountId to the Account SID and campaignId to the EPN campaign ID used in links/reports',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'eBay Partner Network Account SID for reporting:',
      },
      {
        key: 'campaignId',
        message: 'Default eBay Partner campaign ID / campid:',
      },
      {
        key: 'rotationId',
        message: 'Optional marketplace rotation ID (defaults to US):',
      },
      {
        key: 'customId',
        message: 'Optional Custom ID / Sub ID for tracking links:',
      },
    ],
  }),
});

async function ebayReport(
  ctx: AffiliateConnectContext,
  config: Config,
  reportName: string,
  query: Record<string, string>,
): Promise<unknown> {
  const { accountSid, token } = requireReportingAuth(ctx, config);
  const url = new URL(
    `${trimSlash(config.baseUrl ?? DEFAULT_BASE)}/Mediapartners/${encodeURIComponent(accountSid)}/Reports/${reportName}.json`,
  );
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: basicAuth(accountSid, token),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`eBay Partner ${res.status}: ${redact(text, accountSid, token).slice(0, 200)}`);
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function requireReportingAuth(
  ctx: AffiliateConnectContext,
  config: Config,
): { accountSid: string; token: string } {
  const accountSid = config.accountId ?? ctx.secret('EBAY_EPN_ACCOUNT_SID');
  if (!accountSid) throw new Error('eBay Partner accountId / Account SID is required');
  const token = ctx.secret('EBAY_EPN_AUTH_TOKEN') ?? ctx.secret('EBAY_EPN_TOKEN');
  if (!token) throw new Error('EBAY_EPN_AUTH_TOKEN not in vault');
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

function collectItems(data: unknown, keys: string[]): EbayRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is EbayRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: EbayRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function sumFields(rows: EbayRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + keys.reduce((sum, key) => sum + numericValue(row[key]), 0), 0);
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function redact(value: string, accountSid: string, token: string): string {
  return value
    .replaceAll(accountSid, '[redacted]')
    .replaceAll(token, '[redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/=]{12,}/g, 'Basic [redacted]');
}
