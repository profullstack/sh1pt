import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  affiliateId?: string | number;
  baseUrl?: string;
  createdFrom?: string;
  createdTo?: string;
  defaultCurrency?: string;
  publicKey?: string;
}

const DEFAULT_BASE = 'https://api.refersion.com/v2';
const TOTAL_STATUSES = ['APPROVED', 'PENDING', 'UNQUALIFIED', 'DENIED'];

export default defineAffiliate<Config>({
  id: 'affiliate-refersion',
  label: 'Refersion',
  side: 'both',

  async connect(ctx, config) {
    const affiliates = await listAffiliates(ctx, config, 1);
    const first = affiliates[0];
    return {
      accountId: config.accountId ?? stringField(first, ['id']) ?? 'affiliate-refersion',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    const affiliateId = config.affiliateId ?? config.accountId;
    if (!affiliateId) {
      throw new Error('Refersion affiliateId is required to fetch a referral link');
    }
    ctx.log(`refersion referral link · offer=${programId} affiliate=${affiliateId}`);
    const affiliate = await refersionRequest(ctx, config, '/affiliate/get', affiliateLookupBody(affiliateId));
    const link = stringField(asRecord(affiliate), ['link', 'referral_link', 'url']);
    if (!link) throw new Error(`Refersion returned no referral link for affiliate ${affiliateId}`);
    return {
      url: withDestinationSubId(link, destinationUrl),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`refersion stats · offer=${programId}`);
    const offerId = numericId(programId);
    const affiliateId = config.affiliateId ?? undefined;
    const affiliates = await listAffiliates(ctx, config, 100);
    const matchingAffiliates = affiliates.filter((affiliate) =>
      (!offerId || numericId(stringField(affiliate, ['offer_id'])) === offerId)
      && stringField(affiliate, ['status']) !== 'DENIED'
      && stringField(affiliate, ['status']) !== 'DISABLED',
    );
    const totalsBody = totalsRequestBody(config, offerId, affiliateId);
    const [allTotals, paidTotals] = await Promise.all([
      refersionRequest(ctx, config, '/conversion/totals', totalsBody),
      refersionRequest(ctx, config, '/conversion/totals', {
        ...totalsBody,
        status: ['APPROVED'],
        payment_status: 'PAID',
      }),
    ]);
    const all = asRecord(allTotals);
    const paid = asRecord(paidTotals);
    return {
      publishers: matchingAffiliates.length,
      clicks: 0,
      conversions: integerField(all, ['conversions_count']),
      revenue: numericField(all, ['order_total', 'commissionable_order_total']),
      commissionsPaid: numericField(paid, ['commission_total']),
      currency:
        stringField(all, ['currency'])
        ?? stringField(paid, ['currency'])
        ?? config.defaultCurrency
        ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'REFERSION_SECRET_KEY',
    label: 'Refersion',
    vendorDocUrl: 'https://www.refersion.dev/reference/list_affiliates',
    steps: [
      'Open Refersion Account settings and API credentials',
      'Store the Secret Key as REFERSION_SECRET_KEY',
      'Store the Public Key as REFERSION_PUBLIC_KEY or paste it as the publicKey field',
    ],
    fields: [
      {
        key: 'publicKey',
        message: 'Refersion public key, if not already stored as REFERSION_PUBLIC_KEY:',
      },
      {
        key: 'affiliateId',
        message: 'Optional affiliate id/code for referral-link and affiliate-scoped stats:',
      },
    ],
  }),
});

type RefersionRecord = Record<string, unknown>;

async function refersionRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  body: RefersionRecord,
): Promise<unknown> {
  const { publicKey, secretKey } = refersionCredentials(ctx, config);
  const res = await fetch(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'Refersion-Public-Key': publicKey,
      'Refersion-Secret-Key': secretKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Refersion ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 204) return {};
  return res.json();
}

function refersionCredentials(ctx: AffiliateConnectContext, config: Config): {
  publicKey: string;
  secretKey: string;
} {
  const publicKey = ctx.secret('REFERSION_PUBLIC_KEY') ?? config.publicKey;
  const secretKey = ctx.secret('REFERSION_SECRET_KEY') ?? ctx.secret('REFERSION_API_KEY');
  if (!publicKey) throw new Error('REFERSION_PUBLIC_KEY not in vault or config');
  if (!secretKey) throw new Error('REFERSION_SECRET_KEY not in vault');
  return { publicKey, secretKey };
}

async function listAffiliates(
  ctx: AffiliateConnectContext,
  config: Config,
  limit: number,
): Promise<RefersionRecord[]> {
  const data = await refersionRequest(ctx, config, '/affiliate/list', {
    limit: String(limit),
    page: '1',
  });
  return collectItems(data);
}

function affiliateLookupBody(value: string | number): RefersionRecord {
  if (typeof value === 'number') return { id: value };
  const numeric = Number(value);
  if (Number.isInteger(numeric)) return { id: numeric };
  return { affiliate_code: value };
}

function totalsRequestBody(
  config: Config,
  offerId: number | undefined,
  affiliateId: string | number | undefined,
): RefersionRecord {
  return compactRecord({
    created_from: config.createdFrom,
    created_to: config.createdTo,
    offer_id: offerId,
    affiliate_id: numericId(affiliateId),
    status: TOTAL_STATUSES,
    is_test_conversion: false,
  });
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function compactRecord(values: RefersionRecord): RefersionRecord {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ''));
}

function collectItems(data: unknown): RefersionRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.results)) return data.results.filter(isRecord);
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  return [data];
}

function isRecord(value: unknown): value is RefersionRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): RefersionRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringField(item: RefersionRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function integerField(item: RefersionRecord | undefined, keys: string[]): number {
  return Math.trunc(numericField(item, keys));
}

function numericField(item: RefersionRecord | undefined, keys: string[]): number {
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

function numericId(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function withDestinationSubId(link: string, destinationUrl: string): string {
  try {
    const url = new URL(link);
    if (destinationUrl) url.searchParams.set('u', destinationUrl);
    return url.toString();
  } catch {
    return link;
  }
}
