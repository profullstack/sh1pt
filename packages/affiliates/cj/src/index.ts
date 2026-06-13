import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  commissionGraphqlUrl?: string;
  currency?: string;
  from?: string;
  keywords?: string;
  linkSearchUrl?: string;
  pageNumber?: number;
  recordsPerPage?: number;
  to?: string;
  websiteId?: string;
}

type CjRecord = Record<string, unknown>;

const DEFAULT_COMMISSION_GRAPHQL_URL = 'https://commissions.api.cj.com/query';
const DEFAULT_LINK_SEARCH_URL = 'https://link-search.api.cj.com/v2/link-search';
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-cj',
  label: 'CJ Affiliate (Commission Junction)',
  side: 'publisher',

  async connect(ctx, config) {
    requireToken(ctx);
    return { accountId: config.accountId ?? config.websiteId ?? 'affiliate-cj' };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`cj link search · advertiser=${programId}`);
    const websiteId = config.websiteId;
    if (!websiteId) throw new Error('CJ websiteId is required to generate publisher tracking links');
    if (destinationUrl) parseHttpUrl(destinationUrl, 'CJ destinationUrl');

    const xml = await cjLinkSearch(ctx, config, {
      'website-id': websiteId,
      'advertiser-ids': programId,
      'records-per-page': String(config.recordsPerPage ?? 10),
      'page-number': String(config.pageNumber ?? 1),
      ...(destinationUrl ? { 'allow-deep-linking': 'true' } : {}),
      ...(config.keywords ? { keywords: config.keywords } : {}),
    });
    const clickUrl = firstXmlText(xml, ['clickUrl', 'clickURL']) ?? firstHref(xml);
    if (!clickUrl) throw new Error(`CJ returned no active tracking link for advertiser ${programId}`);

    return {
      url: withDeepLinkDestination(clickUrl, destinationUrl, firstXmlText(xml, ['allow-deep-linking'])),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`cj commission stats · advertiser=${programId}`);
    const publisherId = config.accountId;
    if (!publisherId) throw new Error('CJ accountId / publisher CID is required to read commission stats');

    const from = isoDateTime(config.from ?? daysAgo(30), false);
    const to = isoDateTime(config.to ?? today(), true);
    ensureSupportedWindow(from, to);

    const data = await cjGraphql(ctx, config, commissionQuery(publisherId, programId, from, to));
    const commissions = asRecord(asRecord(data)?.data)?.publisherCommissions;
    const wrapper = asRecord(commissions);
    const records = collectItems(wrapper?.records);

    return {
      publishers: 1,
      clicks: 0,
      conversions: numericValue(wrapper?.count) || records.length,
      revenue: sumFields(records, ['saleAmountUsd']),
      commissionsPaid: sumFields(records, ['pubCommissionAmountUsd']),
      currency: config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'CJ_PERSONAL_ACCESS_TOKEN',
    label: 'CJ Affiliate (Commission Junction)',
    vendorDocUrl: 'https://docs.cj.com/docs/api-authentication',
    steps: [
      'Create a Personal Access Token in the CJ Developer Portal',
      'Paste the token below; sh1pt encrypts it in the vault',
      'Set accountId to the publisher Company ID (CID) and websiteId to the Website / Property ID (PID)',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'CJ publisher Company ID / CID for commission reporting:',
      },
      {
        key: 'websiteId',
        message: 'CJ Website ID / Property ID / PID for generated tracking links:',
      },
      {
        key: 'keywords',
        message: 'Optional Link Search keywords to narrow generated links:',
      },
    ],
  }),
});

async function cjLinkSearch(
  ctx: AffiliateConnectContext,
  config: Config,
  query: Record<string, string>,
): Promise<string> {
  const token = requireToken(ctx);
  const url = new URL(config.linkSearchUrl ?? DEFAULT_LINK_SEARCH_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: {
      accept: 'application/xml, text/xml, */*',
      authorization: `Bearer ${token}`,
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`CJ Link Search ${res.status}: ${redact(body, token).slice(0, 200)}`);
  return body;
}

async function cjGraphql(ctx: AffiliateConnectContext, config: Config, query: string): Promise<unknown> {
  const token = requireToken(ctx);
  const res = await fetch(config.commissionGraphqlUrl ?? DEFAULT_COMMISSION_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/graphql',
    },
    body: query,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CJ Commission Detail ${res.status}: ${redact(text, token).slice(0, 200)}`);
  const data = JSON.parse(text) as unknown;
  const errors = asRecord(data)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(`CJ Commission Detail error: ${redact(JSON.stringify(errors), token).slice(0, 200)}`);
  }
  return data;
}

function requireToken(ctx: AffiliateConnectContext): string {
  const token = ctx.secret('CJ_PERSONAL_ACCESS_TOKEN') ?? ctx.secret('CJ_DEVELOPER_KEY');
  if (!token) throw new Error('CJ_PERSONAL_ACCESS_TOKEN not in vault');
  return token;
}

function commissionQuery(publisherId: string, advertiserId: string, from: string, to: string): string {
  return `{
  publisherCommissions(
    forPublishers: [${gqlString(publisherId)}],
    advertiserIds: [${gqlString(advertiserId)}],
    sincePostingDate: ${gqlString(from)},
    beforePostingDate: ${gqlString(to)}
  ) {
    count
    payloadComplete
    records {
      commissionId
      advertiserId
      websiteId
      postingDate
      saleAmountUsd
      pubCommissionAmountUsd
    }
  }
}`;
}

function gqlString(value: string): string {
  return JSON.stringify(value);
}

function firstXmlText(xml: string, tags: string[]): string | undefined {
  for (const tag of tags) {
    const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
    if (match?.[1]) return decodeXml(match[1].trim());
  }
  return undefined;
}

function firstHref(xml: string): string | undefined {
  const match = /href=["']([^"']+)["']/i.exec(xml);
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function withDeepLinkDestination(clickUrl: string, destinationUrl: string, allowDeepLinking: string | undefined): string {
  if (!destinationUrl || allowDeepLinking?.toLowerCase() !== 'true') return clickUrl;
  try {
    const url = new URL(clickUrl);
    if (url.searchParams.has('url')) {
      url.searchParams.set('url', destinationUrl);
      return url.toString();
    }
  } catch {
    return clickUrl;
  }
  return clickUrl;
}

function isoDateTime(value: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
  return value;
}

function ensureSupportedWindow(from: string, to: string): void {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const days = (end - start) / 86_400_000;
  if (days > 31) throw new Error('CJ Commission Detail API supports a maximum 31-day date range per query');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function collectItems(value: unknown): CjRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is CjRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): CjRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function sumFields(rows: CjRecord[], keys: string[]): number {
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

function redact(value: string, token: string): string {
  return value
    .replaceAll(token, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9._~+/=-]{20,}/g, '[redacted-jwt]');
}
