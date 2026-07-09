import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  defaultCurrency?: string;
}

const DEFAULT_BASE = 'https://api.partnerstack.com/api/v2';

export default defineAffiliate<Config>({
  id: 'affiliate-partnerstack',
  label: 'PartnerStack',
  side: 'publisher',

  async connect(ctx, config) {
    const data = await partnerStackRequest(ctx, config, '/partnerships', { limit: '1' });
    const first = collectItems(data)[0];
    return {
      accountId: config.accountId
        ?? stringField(first, ['partner_key', 'partnership_key', 'key'])
        ?? 'affiliate-partnerstack',
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`partnerstack links · partnership=${programId}`);
    const data = await partnerStackRequest(
      ctx,
      config,
      `/links/partnership/${encodeURIComponent(programId)}`,
      { limit: '250' },
    );
    const links = collectItems(data);
    const selected = links.find((item) => matchesDestination(item, destinationUrl)) ?? links[0];
    const url = stringField(selected, ['url', 'link', 'link_url', 'tracking_url', 'referral_url']);
    if (!url) throw new Error(`PartnerStack returned no tracking link for ${programId}`);
    return {
      url,
      shortUrl: stringField(selected, ['short_url', 'shortUrl']),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`partnerstack stats · partnership=${programId}`);
    const [customers, leads, transactions, rewards] = await Promise.all([
      partnerStackRequest(ctx, config, '/customers', { partner_key: programId, limit: '250' }),
      partnerStackRequest(ctx, config, '/leads', { partner_key: programId, limit: '250' }),
      partnerStackRequest(ctx, config, '/transactions', { limit: '250' }),
      partnerStackRequest(ctx, config, '/rewards', { keywords: programId, limit: '250' }),
    ]);

    const customerItems = collectItems(customers);
    const leadItems = collectItems(leads);
    const transactionItems = collectItems(transactions).filter((item) => matchesPartnership(item, programId));
    const rewardItems = collectItems(rewards);
    const currency =
      firstCurrency(rewardItems)
      ?? firstCurrency(transactionItems)
      ?? config.defaultCurrency
      ?? 'USD';

    return {
      publishers: 1,
      clicks: sumNumeric(rewardItems, ['clicks', 'click_count']),
      conversions: customerItems.length + leadItems.length + transactionItems.length,
      revenue: sumMoney(transactionItems),
      commissionsPaid: sumMoney(rewardItems.filter(isPaidReward)),
      currency,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'PARTNERSTACK_API_KEY',
    label: 'PartnerStack',
    vendorDocUrl: 'https://docs.partnerstack.com/docs/partner-api',
    steps: [
      'Open PartnerStack, choose your profile, then open the API tab',
      'Create a Partner API key',
      'Paste the API key below; sh1pt stores it in the vault',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional default partner_key / partnership_key for this account:',
      },
    ],
  }),
});

interface AffiliateConnectContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

type PartnerStackRecord = Record<string, unknown>;

async function partnerStackRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const apiKey = ctx.secret('PARTNERSTACK_API_KEY');
  if (!apiKey) throw new Error('PARTNERSTACK_API_KEY not in vault');
  const url = new URL(`${trimSlash(config.baseUrl ?? DEFAULT_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) throw new Error(`PartnerStack ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function collectItems(data: unknown): PartnerStackRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  const wrapped = data.data;
  if (Array.isArray(wrapped)) return wrapped.filter(isRecord);
  if (!isRecord(wrapped)) return [];
  if (Array.isArray(wrapped.items)) return wrapped.items.filter(isRecord);
  return [wrapped];
}

function isRecord(value: unknown): value is PartnerStackRecord {
  return typeof value === 'object' && value !== null;
}

function stringField(item: PartnerStackRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function numericField(item: PartnerStackRecord, keys: string[]): number {
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

function sumNumeric(items: PartnerStackRecord[], keys: string[]): number {
  return items.reduce((total, item) => total + numericField(item, keys), 0);
}

function sumMoney(items: PartnerStackRecord[]): number {
  return items.reduce((total, item) => total + numericField(item, ['amount', 'revenue']) / 100, 0);
}

function firstCurrency(items: PartnerStackRecord[]): string | undefined {
  for (const item of items) {
    const currency = stringField(item, ['currency']);
    if (currency) return currency;
  }
  return undefined;
}

function isPaidReward(item: PartnerStackRecord): boolean {
  const status = stringField(item, ['payment_status', 'status']);
  return status === 'withdrawn' || status === 'paid_externally' || status === 'paid';
}

function matchesDestination(item: PartnerStackRecord, destinationUrl: string): boolean {
  const destination = stringField(item, ['destination_url', 'target_url', 'landing_url']);
  if (destination && urlsMatch(destination, destinationUrl)) return true;
  const url = stringField(item, ['url', 'link', 'link_url', 'tracking_url', 'referral_url']);
  return url ? urlsMatch(url, destinationUrl) : false;
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

function matchesPartnership(item: PartnerStackRecord, programId: string): boolean {
  return ['partner_key', 'partnership_key', 'partnerKey', 'partnershipKey'].some((key) => item[key] === programId);
}
