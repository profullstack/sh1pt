import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  affiliateId?: string;
  assetId?: string;
  baseUrl?: string;
  defaultCurrency?: string;
  dateFrom?: string;
  dateTo?: string;
}

const DEFAULT_BASE = 'https://api.tapfiliate.com/1.6';

export default defineAffiliate<Config>({
  id: 'affiliate-tapfiliate',
  label: 'Tapfiliate',
  side: 'both',

  async connect(ctx, config) {
    const programs = await listTapfiliate(ctx, config, '/programs/', optionalQuery({
      asset_id: config.assetId,
    }));
    const first = programs[0];
    return {
      accountId: config.accountId ?? stringField(first, ['id']) ?? 'affiliate-tapfiliate',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`tapfiliate referral link · program=${programId}`);
    const affiliateId = configuredAffiliateId(config, programId);
    const affiliates = affiliateId
      ? collectItems(await tapfiliateRequest(
        ctx,
        config,
        `/programs/${encodeURIComponent(programId)}/affiliates/${encodeURIComponent(affiliateId)}/`,
      ))
      : await listTapfiliate(ctx, config, `/programs/${encodeURIComponent(programId)}/affiliates/`);

    const selected =
      affiliates.find((item) => matchesReferralDestination(item, destinationUrl))
      ?? affiliates.find(hasReferralLink);
    const url = referralLink(selected);
    if (!url) {
      throw new Error(
        `Tapfiliate returned no referral link for ${programId}; set affiliateId or approve an affiliate first`,
      );
    }
    return {
      url,
      shortUrl: stringField(recordField(selected, ['referral_link']), ['short_url', 'shortUrl']),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`tapfiliate stats · program=${programId}`);
    const affiliateId = configuredAffiliateId(config, programId);
    const dateQuery = optionalQuery({
      date_from: config.dateFrom,
      date_to: config.dateTo,
    });
    const affiliateQuery = optionalQuery({ affiliate_id: affiliateId });
    const [program, affiliates, conversions, commissions, payments, clicks] = await Promise.all([
      tapfiliateRequest(ctx, config, `/programs/${encodeURIComponent(programId)}/`),
      listTapfiliate(ctx, config, `/programs/${encodeURIComponent(programId)}/affiliates/`),
      listTapfiliate(ctx, config, '/conversions/', {
        program_id: programId,
        ...affiliateQuery,
        ...dateQuery,
      }),
      listTapfiliate(ctx, config, '/commissions/', affiliateQuery).then((items) =>
        items.filter((item) => matchesProgram(item, programId)),
      ),
      listTapfiliate(ctx, config, '/payments/').then((items) =>
        items.filter((item) => !affiliateId || nestedString(item, ['affiliate', 'id']) === affiliateId),
      ),
      listTapfiliateOptional(ctx, config, '/clicks/', {
        program_id: programId,
        ...affiliateQuery,
        ...dateQuery,
      }),
    ]);

    const conversionCommissions = conversions.flatMap((conversion) =>
      arrayField(conversion, ['commissions']).filter(isRecord),
    );
    const paidCommissions = [...conversionCommissions, ...commissions].filter(isPaidCommission);
    const currency =
      stringField(asRecord(program), ['currency'])
      ?? firstCurrency(conversions)
      ?? firstCurrency(commissions)
      ?? firstCurrency(payments)
      ?? config.defaultCurrency
      ?? 'USD';

    return {
      publishers: affiliates.filter((affiliate) => affiliate.approved !== false).length,
      clicks: clicks.length,
      conversions: conversions.length,
      revenue: sumMoney(conversions, ['amount']),
      commissionsPaid: sumMoney(paidCommissions, ['amount']),
      currency,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'TAPFILIATE_API_KEY',
    label: 'Tapfiliate',
    vendorDocUrl: 'https://tapfiliate.com/docs/rest/',
    steps: [
      'Log into Tapfiliate and open the REST API settings',
      'Create or copy an API key',
      'Paste the API key below; sh1pt stores it in the vault',
    ],
    fields: [
      {
        key: 'affiliateId',
        message: 'Optional affiliate id to use when generating referral links:',
      },
      {
        key: 'assetId',
        message: 'Optional asset id used to filter programs during setup:',
      },
    ],
  }),
});

type TapRecord = Record<string, unknown>;

async function tapfiliateRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const apiKey = ctx.secret('TAPFILIATE_API_KEY');
  if (!apiKey) throw new Error('TAPFILIATE_API_KEY not in vault');

  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Api-Key': apiKey,
    },
  });
  if (!res.ok) throw new Error(`Tapfiliate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function listTapfiliate(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<TapRecord[]> {
  return collectItems(await tapfiliateRequest(ctx, config, path, query));
}

async function listTapfiliateOptional(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<TapRecord[]> {
  try {
    return await listTapfiliate(ctx, config, path, query);
  } catch (error) {
    if (error instanceof Error && /^Tapfiliate (403|404):/.test(error.message)) return [];
    throw error;
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function optionalQuery(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
  );
}

function collectItems(data: unknown): TapRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  if (Array.isArray(data.results)) return data.results.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  return [data];
}

function isRecord(value: unknown): value is TapRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): TapRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function recordField(item: TapRecord | undefined, path: string[]): TapRecord | undefined {
  const value = nestedValue(item, path);
  return isRecord(value) ? value : undefined;
}

function arrayField(item: TapRecord, path: string[]): unknown[] {
  const value = nestedValue(item, path);
  return Array.isArray(value) ? value : [];
}

function stringField(item: TapRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function nestedString(item: TapRecord | undefined, path: string[]): string | undefined {
  const value = nestedValue(item, path);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function nestedValue(item: TapRecord | undefined, path: string[]): unknown {
  let current: unknown = item;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function numericField(item: TapRecord, keys: string[]): number {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function sumMoney(items: TapRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}

function firstCurrency(items: TapRecord[]): string | undefined {
  for (const item of items) {
    const currency = stringField(item, ['currency']) ?? nestedString(item, ['program', 'currency']);
    if (currency) return currency;
  }
  return undefined;
}

function configuredAffiliateId(config: Config, programId: string): string | undefined {
  if (config.affiliateId) return config.affiliateId;
  return config.accountId && config.accountId !== programId ? config.accountId : undefined;
}

function referralLink(item: TapRecord | undefined): string | undefined {
  return stringField(recordField(item, ['referral_link']), ['link', 'url']) ?? stringField(item, ['referral_link']);
}

function hasReferralLink(item: TapRecord): boolean {
  return Boolean(referralLink(item));
}

function matchesReferralDestination(item: TapRecord, destinationUrl: string): boolean {
  const link = referralLink(item);
  if (!link) return false;
  return urlsMatch(link, destinationUrl);
}

function urlsMatch(candidate: string, destinationUrl: string): boolean {
  try {
    const left = new URL(candidate);
    const right = new URL(destinationUrl);
    return left.hostname === right.hostname && left.pathname === right.pathname;
  } catch {
    return candidate === destinationUrl;
  }
}

function matchesProgram(item: TapRecord, programId: string): boolean {
  const explicitProgram =
    stringField(item, ['program_id'])
    ?? nestedString(item, ['program', 'id'])
    ?? nestedString(item, ['conversion', 'program', 'id']);
  return !explicitProgram || explicitProgram === programId;
}

function isPaidCommission(item: TapRecord): boolean {
  if (item.paid === true) return true;
  if (isRecord(item.payout) || isRecord(item.payment)) return true;
  const status = stringField(item, ['status', 'payment_status']);
  return status === 'paid' || status === 'paid_out';
}
