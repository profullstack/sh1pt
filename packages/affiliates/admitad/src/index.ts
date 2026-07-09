import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  from?: string;
  language?: string;
  subid?: string;
  subid1?: string;
  subid2?: string;
  subid3?: string;
  subid4?: string;
  to?: string;
  websiteId?: string;
}

type AdmitadRecord = Record<string, unknown>;

const DEFAULT_BASE = 'https://api.admitad.com';

export default defineAffiliate<Config>({
  id: 'affiliate-admitad',
  label: 'Admitad',
  side: 'publisher',

  async connect(ctx, config) {
    requireToken(ctx);
    const configuredWebsite = admitadWebsiteId(config);
    if (configuredWebsite) return { accountId: configuredWebsite };

    const data = await admitadGet(ctx, config, '/websites/v2/');
    const website = collectItems(data)
      .find((item) => stringField(item, ['status']) === 'active')
      ?? collectItems(data)[0];
    return {
      accountId: stringField(website, ['id']) ?? 'affiliate-admitad',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`admitad deeplink · campaign=${programId}`);
    const websiteId = admitadWebsiteId(config);
    if (!websiteId) throw new Error('Admitad websiteId/accountId is required to generate deeplinks');
    if (destinationUrl) parseHttpUrl(destinationUrl, 'Admitad destinationUrl');

    const query: Record<string, string | string[]> = { ulp: destinationUrl };
    for (const key of ['subid', 'subid1', 'subid2', 'subid3', 'subid4'] as const) {
      if (config[key]) query[key] = config[key];
    }

    const data = await admitadGet(
      ctx,
      config,
      `/deeplink/${encodeURIComponent(websiteId)}/advcampaign/${encodeURIComponent(programId)}/`,
      query,
    );
    const first = collectItems(data)[0];
    const url = stringField(first, ['link', 'url']);
    if (!url) throw new Error(`Admitad returned no deeplink for campaign ${programId}`);
    return { url };
  },

  async stats(ctx, programId, config) {
    ctx.log(`admitad stats · campaign=${programId}`);
    const websiteId = admitadWebsiteId(config);
    const query: Record<string, string> = {
      campaign: programId,
      date_start: admitadDate(config.from ?? daysAgo(30)),
      date_end: admitadDate(config.to ?? today()),
      limit: '100',
    };
    if (websiteId) query.website = websiteId;

    const [websiteStats, actionStats] = await Promise.all([
      admitadGet(ctx, config, '/statistics/websites/', { ...query, total: '1' }),
      admitadGet(ctx, config, '/statistics/actions/', query),
    ]);
    const websiteRows = collectItems(websiteStats);
    const actionRows = collectItems(actionStats);
    const row = websiteRows[0];
    const sales = sumFields(websiteRows, ['sales_sum', 'sales_approved', 'sales_open']);
    const leads = sumFields(websiteRows, ['leads_sum', 'leads_approved', 'leads_open']);
    const totalConversions = sumFields(websiteRows, ['actions_sum_total']);
    const actionConversions = actionRows.length;
    const revenue = sumFields(websiteRows, ['payment_sum'])
      || sumFields(websiteRows, ['payment_sum_approved', 'payment_sum_open'])
      || sumMoney(actionRows);
    const paid = sumPaidActions(actionRows) || sumFields(websiteRows, ['payment_sum_approved']);

    return {
      publishers: websiteId ? 1 : websiteRows.length,
      clicks: sumFields(websiteRows, ['clicks']),
      conversions: totalConversions || sales + leads || actionConversions,
      revenue,
      commissionsPaid: paid,
      currency: stringField(row, ['currency']) ?? firstCurrency(actionRows) ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'ADMITAD_ACCESS_TOKEN',
    label: 'Admitad',
    vendorDocUrl: 'https://developers.admitad.com/knowledge-base/articles/publisher-api-methods',
    steps: [
      'Create or reuse an Admitad API application with publisher scopes: websites, advcampaigns, advcampaigns_for_website, deeplink_generator, and statistics',
      'Use the official OAuth flow to mint a bearer access token',
      'Paste the access token below; optionally set websiteId/accountId for the publisher ad space',
    ],
    fields: [
      {
        key: 'websiteId',
        message: 'Optional Admitad publisher ad space / website id:',
      },
      {
        key: 'language',
        message: 'Optional affiliate program language code:',
      },
      {
        key: 'subid',
        message: 'Optional SubID to attach to generated deeplinks:',
      },
    ],
  }),
});

async function admitadGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string | string[]> = {},
): Promise<unknown> {
  const token = requireToken(ctx);
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  if (config.language && !('language' in query)) url.searchParams.set('language', config.language);
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, item);
  }

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Admitad ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function requireToken(ctx: AffiliateConnectContext): string {
  const token = ctx.secret('ADMITAD_ACCESS_TOKEN');
  if (!token) throw new Error('ADMITAD_ACCESS_TOKEN not in vault');
  return token;
}

function admitadWebsiteId(config: Config): string | undefined {
  return config.websiteId ?? config.accountId;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function admitadDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return value;
  return `${iso[3]}.${iso[2]}.${iso[1]}`;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function collectItems(data: unknown): AdmitadRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.results)) return data.results.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  return [data];
}

function isRecord(value: unknown): value is AdmitadRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: AdmitadRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function sumFields(rows: AdmitadRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + keys.reduce((sum, key) => sum + numberValue(row[key]), 0), 0);
}

function sumMoney(rows: AdmitadRecord[]): number {
  return rows.reduce((total, row) => total + numberValue(row.payment), 0);
}

function sumPaidActions(rows: AdmitadRecord[]): number {
  return rows.reduce((total, row) => {
    const paid = row.paid === true || row.paid === 1 || row.paid === '1';
    return paid ? total + numberValue(row.payment) : total;
  }, 0);
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstCurrency(rows: AdmitadRecord[]): string | undefined {
  for (const row of rows) {
    const currency = stringField(row, ['currency']);
    if (currency) return currency;
  }
  return undefined;
}
