import {
  defineAffiliate,
  tokenSetup,
  type AffiliateConnectContext,
  type AffiliateProgram,
} from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  productId?: string;
  affiliate?: string;
  campaignKey?: string;
  trackingKey?: string;
  validUntil?: string;
  from?: string;
  to?: string;
  fromMonth?: string;
  toMonth?: string;
  currency?: string;
}

const DEFAULT_BASE_URL = 'https://www.digistore24.com/api/call';

interface Digistore24Product {
  id: string | number;
  name?: string;
  tag?: string | null;
  marketplace_url?: string;
  url?: string;
}

interface Digistore24BuyUrl {
  url?: string;
  data?: {
    url?: string;
  };
}

interface Digistore24ToplistItem {
  affiliate_id?: string | number;
  affiliate_name?: string;
  currency?: string;
  brutto_amount?: number;
  netto_amount?: number;
  payment_amount?: number;
  affiliate_amount?: number;
}

interface Digistore24ToplistResponse {
  top_list?: Digistore24ToplistItem[];
  data?: {
    top_list?: Digistore24ToplistItem[];
  };
}

interface Digistore24ClickStats {
  totals?: {
    funnelVisitors?: number;
    orderFormVisitors?: number;
    earnings?: number;
  };
  data?: {
    totals?: {
      funnelVisitors?: number;
      orderFormVisitors?: number;
      earnings?: number;
    };
  };
}

interface Digistore24Transaction {
  amount?: number;
  currency?: string;
  transaction_type?: string;
}

interface Digistore24TransactionResponse {
  transaction_list?: Digistore24Transaction[];
  data?: {
    transaction_list?: Digistore24Transaction[];
    summary?: {
      amounts?: Record<string, {
        count?: number;
        total_amount?: number;
        earned_amount?: number;
      }>;
      count?: number;
    };
  };
}

export default defineAffiliate<Config>({
  id: 'affiliate-digistore24',
  label: 'Digistore24',
  side: 'both',

  async connect(ctx, config) {
    const token = ctx.secret('DIGISTORE24_API_KEY');
    if (!token) throw new Error('DIGISTORE24_API_KEY not in vault - run `sh1pt promote affiliates setup`');
    return { accountId: config.accountId ?? 'affiliate-digistore24' };
  },

  async createProgram(ctx, program, config) {
    ctx.log(`digistore24 - resolve product ${program.name}`);
    const product = await resolveProduct(ctx, program, config);
    return {
      programId: String(product.id),
      marketplaceUrl: product.marketplace_url ?? product.url ?? program.destinationUrl,
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`digistore24 - buy url product=${programId}`);
    const affiliate = config.affiliate;
    if (!affiliate) throw new Error('Digistore24 tracking links require config.affiliate');

    const buyUrl = await digistore24Request<Digistore24BuyUrl>(ctx, config, 'POST', 'createBuyUrl', {
      product_id: programId,
      tracking: compact({
        affiliate,
        campaignkey: config.campaignKey,
        trackingkey: config.trackingKey,
      }),
      urls: compact({
        fallback_url: destinationUrl,
      }),
      valid_until: config.validUntil ?? 'forever',
    });

    const url = buyUrl.url ?? buyUrl.data?.url;
    if (!url) throw new Error(`Digistore24 createBuyUrl did not return a URL for product ${programId}`);
    return { url };
  },

  async stats(ctx, programId, config) {
    ctx.log(`digistore24 - stats product=${programId}`);
    const now = new Date();
    const from = config.from ?? daysAgoIso(now, 30);
    const to = config.to ?? 'today';
    const fromMonth = config.fromMonth ?? from.slice(0, 7);
    const toMonth = config.toMonth ?? now.toISOString().slice(0, 7);

    const [toplistResponse, clickStatsResponse, transactionResponse] = await Promise.all([
      digistore24Request<Digistore24ToplistResponse>(ctx, config, 'GET', 'statsAffiliateToplist', compact({
        from: fromMonth,
        to: toMonth,
        currency: config.currency,
      })),
      digistore24Request<Digistore24ClickStats>(ctx, config, 'GET', 'statsClicksAndEarningsByDateAndCampaignKey', compact({
        from,
        to,
        interval: 'day',
        viewRole: 'affiliate,vendor',
        currency: config.currency,
      })),
      digistore24Request<Digistore24TransactionResponse>(ctx, config, 'GET', 'listTransactions', compact({
        from,
        to: config.to ?? 'now',
        search: compact({
          role: 'vendor,affiliate',
          product_id: programId,
        }),
        page_size: 1000,
      })),
    ]);

    const topList = toplistResponse.top_list ?? toplistResponse.data?.top_list ?? [];
    const totals = clickStatsResponse.totals ?? clickStatsResponse.data?.totals;
    const transactions = transactionResponse.transaction_list ?? transactionResponse.data?.transaction_list ?? [];
    const summaryAmounts = Object.values(transactionResponse.data?.summary?.amounts ?? {});

    const conversionCount = summaryAmounts.reduce((sum, amount) => sum + numberValue(amount.count), 0)
      || transactions.filter((transaction) => transaction.transaction_type !== 'refund' && transaction.transaction_type !== 'chargeback').length;
    const transactionRevenue = summaryAmounts.reduce((sum, amount) => sum + numberValue(amount.total_amount), 0)
      || transactions.reduce((sum, transaction) => sum + numberValue(transaction.amount), 0);
    const transactionCommissions = summaryAmounts.reduce((sum, amount) => sum + numberValue(amount.earned_amount), 0);
    const toplistRevenue = topList.reduce((sum, affiliate) => {
      return sum + numberValue(affiliate.payment_amount ?? affiliate.netto_amount ?? affiliate.brutto_amount);
    }, 0);
    const toplistCommissions = topList.reduce((sum, affiliate) => sum + numberValue(affiliate.affiliate_amount), 0);

    return {
      publishers: topList.length,
      clicks: numberValue(totals?.funnelVisitors ?? totals?.orderFormVisitors),
      conversions: conversionCount,
      revenue: numberValue(totals?.earnings) || transactionRevenue || toplistRevenue,
      commissionsPaid: transactionCommissions || toplistCommissions,
      currency: config.currency ?? firstCurrency(topList, transactions) ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'DIGISTORE24_API_KEY',
    label: 'Digistore24',
    vendorDocUrl: 'https://digistore24.com/api/docs/index.html',
    steps: [
      'Log into digistore24.com -> Settings -> API access',
      'Generate an API key with product, buy URL, statistics, and transaction access',
      'Paste below',
      'Set productId for an existing Digistore24 product and affiliate for tracked buy URLs',
    ],
  }),
});

async function resolveProduct(
  ctx: AffiliateConnectContext,
  program: Pick<AffiliateProgram, 'name' | 'destinationUrl'>,
  config: Config,
): Promise<Digistore24Product> {
  if (config.productId) {
    const result = await digistore24Request<{ product?: Digistore24Product; data?: Digistore24Product }>(
      ctx,
      config,
      'GET',
      'getProduct',
      { product_id: config.productId },
    );
    return result.product ?? result.data ?? { id: config.productId, url: program.destinationUrl };
  }

  const productsResponse = await digistore24Request<Digistore24Product[] | { products?: Digistore24Product[]; data?: Digistore24Product[] }>(
    ctx,
    config,
    'GET',
    'listProducts',
    { sort_by: 'name' },
  );
  const products = Array.isArray(productsResponse)
    ? productsResponse
    : productsResponse.products ?? productsResponse.data ?? [];
  const normalizedName = program.name.toLowerCase();
  const match = products.find((product) => {
    return product.name?.toLowerCase() === normalizedName || product.tag?.toLowerCase() === normalizedName;
  });
  if (match) return match;
  if (products.length === 1) return products[0]!;

  throw new Error(
    'Digistore24 API does not expose generic affiliate program creation. Set config.productId for an existing Digistore24 product.',
  );
}

async function digistore24Request<T>(
  ctx: AffiliateConnectContext,
  config: Config,
  method: 'GET' | 'POST',
  operation: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = ctx.secret('DIGISTORE24_API_KEY');
  if (!apiKey) throw new Error('DIGISTORE24_API_KEY not in vault');
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/${operation.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'X-DS-API-KEY': apiKey,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Digistore24 ${res.status}: ${text.slice(0, 200)}`);
  const body = (text ? JSON.parse(text) : {}) as { result?: string; message?: string; error?: string };
  if (body.result === 'error') {
    throw new Error(`Digistore24 API error: ${body.message ?? body.error ?? 'unknown error'}`);
  }
  return body as T;
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    return entry !== undefined && entry !== null && entry !== '';
  })) as Partial<T>;
}

function daysAgoIso(now: Date, days: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function firstCurrency(
  topList: Digistore24ToplistItem[],
  transactions: Digistore24Transaction[],
): string | undefined {
  return topList.find((affiliate) => affiliate.currency)?.currency
    ?? transactions.find((transaction) => transaction.currency)?.currency;
}
