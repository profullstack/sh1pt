import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  authUrl?: string;
  clientId?: string;
  currency?: string;
  customId?: string;
  domainId?: string;
  from?: string;
  publisherDomainId?: string;
  publisherId?: string;
  reportingBaseUrl?: string;
  sref?: string;
  to?: string;
  wrapperUrl?: string;
}

type SkimlinksRecord = Record<string, unknown>;

const DEFAULT_AUTH_URL = 'https://authentication.skimapis.com/access_token';
const DEFAULT_REPORTING_BASE = 'https://reporting.skimapis.com';
const DEFAULT_WRAPPER_URL = 'https://go.skimresources.com/';
const DEFAULT_CURRENCY = 'USD';

export default defineAffiliate<Config>({
  id: 'affiliate-skimlinks',
  label: 'Skimlinks',
  side: 'publisher',

  async connect(ctx, config) {
    await skimlinksAccessToken(ctx, config);
    return { accountId: skimlinksPublisherId(config) ?? skimlinksDomainId(config) ?? 'affiliate-skimlinks' };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`skimlinks link wrapper · advertiser=${programId}`);
    const domainId = skimlinksDomainId(config);
    if (!domainId) throw new Error('Skimlinks domainId is required to build Link Wrapper URLs');
    if (!destinationUrl) throw new Error('Skimlinks destinationUrl is required to build Link Wrapper URLs');

    const url = new URL(config.wrapperUrl ?? DEFAULT_WRAPPER_URL);
    url.searchParams.set('id', domainId);
    url.searchParams.set('url', destinationUrl);
    if (config.sref) url.searchParams.set('sref', config.sref);
    if (config.customId ?? programId) url.searchParams.set('xcust', config.customId ?? programId);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`skimlinks reporting · advertiser=${programId}`);
    const publisherId = skimlinksPublisherId(config);
    if (!publisherId) throw new Error('Skimlinks publisherId/accountId is required to read reporting stats');

    const data = await skimlinksGet(ctx, config, config.reportingBaseUrl ?? DEFAULT_REPORTING_BASE, `/publisher/${encodeURIComponent(publisherId)}/reports`, {
      report_by: 'merchant',
      start_date: config.from ?? daysAgo(30),
      end_date: config.to ?? today(),
      sort_by: 'publisher_commission_amount',
      sort_dir: 'DESC',
      currency: config.currency ?? DEFAULT_CURRENCY,
      a_id: programId,
      ...(config.publisherDomainId ? { domain_id: config.publisherDomainId } : {}),
    });
    const record = asRecord(data);
    const reports = collectItems(record?.reports);
    const totals = asRecord(record?.totals);
    return {
      publishers: 1,
      clicks: numericField(totals, ['clicks_affiliated']) || sumFields(reports, ['clicks_affiliated']),
      conversions: numericField(totals, ['sales']) || sumFields(reports, ['sales']),
      revenue: numericField(totals, ['order_amount']) || sumFields(reports, ['order_amount']),
      commissionsPaid:
        numericField(totals, ['publisher_commission_amount'])
        || sumFields(reports, ['publisher_commission_amount']),
      currency: config.currency ?? stringField(totals, ['currency', 'publisher_currency']) ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'SKIMLINKS_CLIENT_SECRET',
    label: 'Skimlinks',
    vendorDocUrl: 'https://developers.skimlinks.com/',
    steps: [
      'Open Publisher Hub -> Toolbox -> APIs -> API Authentication credentials',
      'Copy the Client ID into setup config and paste the Client Secret into the vault',
      'Set publisherId/accountId for Reporting API calls and domainId for Link Wrapper URLs',
    ],
    fields: [
      {
        key: 'clientId',
        message: 'Skimlinks API Client ID:',
      },
      {
        key: 'publisherId',
        message: 'Skimlinks Publisher ID for Merchant/Reporting API calls:',
      },
      {
        key: 'domainId',
        message: 'Skimlinks domain-specific Link Wrapper ID:',
      },
      {
        key: 'publisherDomainId',
        message: 'Optional numeric publisher domain ID for Merchant/Reporting filters:',
      },
    ],
  }),
});

async function skimlinksGet(
  ctx: AffiliateConnectContext,
  config: Config,
  baseUrl: string,
  path: string,
  query: Record<string, string>,
): Promise<unknown> {
  const token = await skimlinksAccessToken(ctx, config);
  const url = new URL(`${trimSlash(baseUrl)}${path}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Skimlinks ${res.status}: ${redact(text, ctx, config, token).slice(0, 200)}`);
  return JSON.parse(text) as unknown;
}

async function skimlinksAccessToken(ctx: AffiliateConnectContext, config: Config): Promise<string> {
  const directToken = ctx.secret('SKIMLINKS_ACCESS_TOKEN') ?? ctx.secret('SKIMLINKS_API_KEY');
  if (directToken) return directToken;

  const clientId = config.clientId ?? ctx.secret('SKIMLINKS_CLIENT_ID');
  const clientSecret = ctx.secret('SKIMLINKS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('SKIMLINKS_CLIENT_ID/clientId and SKIMLINKS_CLIENT_SECRET are required');
  }

  const res = await fetch(config.authUrl ?? DEFAULT_AUTH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Skimlinks auth ${res.status}: ${redact(text, ctx, config).slice(0, 200)}`);
  const token = stringField(asRecord(JSON.parse(text)), ['access_token']);
  if (!token) throw new Error('Skimlinks auth response did not include access_token');
  return token;
}

function skimlinksPublisherId(config: Config): string | undefined {
  return config.publisherId ?? config.accountId;
}

function skimlinksDomainId(config: Config): string | undefined {
  return config.domainId ?? config.publisherDomainId;
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

function collectItems(value: unknown): SkimlinksRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is SkimlinksRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): SkimlinksRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: SkimlinksRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numericField(item: SkimlinksRecord | undefined, keys: string[]): number {
  if (!item) return 0;
  for (const key of keys) {
    const parsed = numericValue(item[key]);
    if (parsed) return parsed;
  }
  return 0;
}

function sumFields(rows: SkimlinksRecord[], keys: string[]): number {
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

function redact(
  value: string,
  ctx: AffiliateConnectContext,
  config: Config,
  token?: string,
): string {
  let redacted = value;
  const secrets = [
    token,
    config.clientId,
    ctx.secret('SKIMLINKS_CLIENT_ID'),
    ctx.secret('SKIMLINKS_CLIENT_SECRET'),
    ctx.secret('SKIMLINKS_ACCESS_TOKEN'),
    ctx.secret('SKIMLINKS_API_KEY'),
  ].filter((item): item is string => Boolean(item));
  for (const secret of secrets) redacted = redacted.replaceAll(secret, '[redacted]');
  return redacted.replace(/\b\d+:\d{10}:[a-f0-9]{16,}\b/gi, '[redacted-token]');
}
