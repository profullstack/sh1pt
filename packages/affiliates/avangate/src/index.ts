import { createHmac } from 'node:crypto';
import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  affiliateId?: string;
  apiBase?: string;
  checkoutBase?: string;
  currency?: string;
  from?: string;
  includePartnerOrders?: boolean;
  limit?: number;
  page?: number;
  productId?: string;
  source?: string;
  to?: string;
}

type AvangateRecord = Record<string, unknown>;

const SECRET_KEY = 'AVANGATE_API_KEY';
const DEFAULT_API_BASE = 'https://api.2checkout.com/rest/6.0';
const DEFAULT_CHECKOUT_BASE = 'https://secure.2checkout.com';
const DEFAULT_CURRENCY = 'USD';
const HASH_ALGO = 'sha256';

export default defineAffiliate<Config>({
  id: 'affiliate-avangate',
  label: 'Avangate (2Checkout / Verifone)',
  side: 'merchant',

  async connect(ctx, config) {
    const accountId = merchantCode(config);
    await avangateGet(ctx, config, '/payouts/pending/', balanceQuery(config));
    return { accountId };
  },

  async createProgram(ctx, program, config) {
    const productId = config.productId;
    if (!productId) {
      throw new Error(
        'Avangate affiliate programs are configured in the 2Checkout Control Panel; set productId to generate buy-links',
      );
    }
    ctx.log(
      `avangate affiliate program · product=${productId} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`,
    );
    return {
      programId: productId,
      marketplaceUrl: `${trimSlash(config.checkoutBase ?? DEFAULT_CHECKOUT_BASE)}/cpanel/affiliate_network.php`,
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`avangate buy-link · product=${programId}`);
    return {
      url: checkoutUrl(programId, destinationUrl, config).toString(),
    };
  },

  async stats(ctx, programId, config) {
    ctx.log(`avangate orders · product=${programId}`);
    const ordersData = await avangateGet(ctx, config, '/orders/', orderQuery(config));
    const orders = collectItems(ordersData)
      .filter((order) => matchesProgram(order, programId));
    return {
      publishers: uniqueCount(orders.flatMap(affiliateCodes)),
      clicks: 0,
      conversions: orders.length,
      revenue: sumOrderTotals(orders),
      commissionsPaid: sumFields(orders, [
        'AffiliateCommission',
        'AffiliateCommissions',
        'Commission',
        'CommissionAmount',
        'CommissionsPaid',
      ]),
      currency: firstString(orders, ['Currency', 'currency', 'CurrencyCode']) ?? config.currency ?? DEFAULT_CURRENCY,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Avangate (2Checkout / Verifone)',
    vendorDocUrl: 'https://verifone.cloud/docs/2checkout/API-Integration/01Start-using-the-2Checkout-API/API_Authentication',
    steps: [
      'Log into the 2Checkout Merchant Control Panel -> Integrations -> Webhooks & API',
      'Store the Merchant Code as accountId and paste the Secret Key below',
      'Optionally set productId for generated checkout buy-links and affiliateId for AVGAFFILIATE tracking',
    ],
    fields: [
      {
        key: 'accountId',
        message: '2Checkout Merchant Code:',
      },
      {
        key: 'productId',
        message: 'Optional 2Checkout numeric Product ID for generated buy-links:',
      },
      {
        key: 'affiliateId',
        message: 'Optional affiliate ID to add as AVGAFFILIATE:',
      },
    ],
  }),
});

async function avangateGet(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const secret = ctx.secret(SECRET_KEY);
  if (!secret) throw new Error(`${SECRET_KEY} not in vault`);
  const code = merchantCode(config);
  const url = new URL(`${trimSlash(config.apiBase ?? DEFAULT_API_BASE)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-Avangate-Authentication': authHeader(code, secret),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Avangate ${res.status}: ${redact(text, secret, code).slice(0, 200)}`);
  }
  return res.json();
}

function authHeader(code: string, secret: string): string {
  const date = utcDateTime();
  const signatureBase = `${code.length}${code}${date.length}${date}`;
  const hash = createHmac(HASH_ALGO, secret).update(signatureBase).digest('hex');
  return `code="${code}" date="${date}" hash="${hash}" algo="${HASH_ALGO}"`;
}

function utcDateTime(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    '-',
    pad(date.getUTCMonth() + 1),
    '-',
    pad(date.getUTCDate()),
    ' ',
    pad(date.getUTCHours()),
    ':',
    pad(date.getUTCMinutes()),
    ':',
    pad(date.getUTCSeconds()),
  ].join('');
}

function merchantCode(config: Config): string {
  if (config.accountId) return config.accountId;
  throw new Error('Avangate accountId / 2Checkout Merchant Code is required');
}

function checkoutUrl(programId: string, destinationUrl: string, config: Config): URL {
  const productId = config.productId ?? programId;
  if (!productId) throw new Error('Avangate productId is required to generate a buy-link');
  const url = isCheckoutUrl(destinationUrl)
    ? new URL(destinationUrl)
    : new URL('/order/checkout.php', trimSlash(config.checkoutBase ?? DEFAULT_CHECKOUT_BASE));
  if (!url.searchParams.has('PRODS')) url.searchParams.set('PRODS', productId);
  if (!url.searchParams.has('QTY')) url.searchParams.set('QTY', '1');
  if (config.currency && !url.searchParams.has('CURRENCY')) {
    url.searchParams.set('CURRENCY', config.currency.toUpperCase());
  }
  if (config.source && !url.searchParams.has('SRC')) {
    url.searchParams.set('SRC', sanitizeSource(config.source));
  }
  if (config.affiliateId && !url.searchParams.has('AVGAFFILIATE')) {
    url.searchParams.set('AVGAFFILIATE', config.affiliateId);
  }
  return url;
}

function isCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.endsWith('2checkout.com') && url.pathname.endsWith('/order/checkout.php');
  } catch {
    return false;
  }
}

function sanitizeSource(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function balanceQuery(config: Config): Record<string, string> {
  const currency = (config.currency ?? DEFAULT_CURRENCY).toUpperCase();
  return {
    Currency: currency,
    TotalCurrency: currency,
  };
}

function orderQuery(config: Config): Record<string, string> {
  const query: Record<string, string> = {
    PartnerOrders: String(config.includePartnerOrders ?? true),
    Page: String(config.page ?? 1),
    Limit: String(config.limit ?? 50),
  };
  if (config.from) query.StartDate = config.from;
  if (config.to) query.EndDate = config.to;
  return query;
}

function collectItems(data: unknown): AvangateRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ['Items', 'items', 'Orders', 'orders', 'data']) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function matchesProgram(order: AvangateRecord, programId: string): boolean {
  if (!programId) return true;
  if (stringField(order, ['ProductId', 'ProductID', 'ProductCode', 'ExternalReference']) === programId) return true;
  return orderItems(order).some((item) =>
    stringField(item, ['ProductId', 'ProductID', 'ProductCode', 'Code', 'AvangateId']) === programId
  );
}

function orderItems(order: AvangateRecord): AvangateRecord[] {
  for (const key of ['Items', 'items', 'Products', 'products']) {
    const value = order[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function affiliateCodes(order: AvangateRecord): string[] {
  return [
    stringField(order, ['AffiliateCode', 'AffiliateId', 'AffiliateID', 'AVGAFFILIATE']),
    ...orderItems(order).map((item) =>
      stringField(item, ['AffiliateCode', 'AffiliateId', 'AffiliateID', 'AVGAFFILIATE'])
    ),
  ].filter((value): value is string => Boolean(value));
}

function sumOrderTotals(orders: AvangateRecord[]): number {
  return orders.reduce((total, order) => {
    const orderTotal = numericField(order, ['Total', 'TotalAmount', 'GrossPrice', 'NetPrice', 'Amount']);
    if (orderTotal) return total + orderTotal;
    return total + sumFields(orderItems(order), ['Price', 'Amount', 'GrossPrice', 'NetPrice']);
  }, 0);
}

function sumFields(rows: AvangateRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + numericField(row, keys), 0);
}

function numericField(row: AvangateRecord | undefined, keys: string[]): number {
  if (!row) return 0;
  for (const key of keys) {
    const parsed = numericValue(row[key]);
    if (parsed) return parsed;
  }
  return 0;
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (isRecord(value)) {
    return numericField(value, ['Amount', 'amount', 'Value', 'value']);
  }
  return 0;
}

function stringField(item: AvangateRecord | undefined, keys: string[]): string | undefined {
  if (!item) return undefined;
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(items: AvangateRecord[], keys: string[]): string | undefined {
  for (const item of items) {
    const value = stringField(item, keys);
    if (value) return value;
  }
  return undefined;
}

function uniqueCount(values: string[]): number {
  return new Set(values).size;
}

function isRecord(value: unknown): value is AvangateRecord {
  return typeof value === 'object' && value !== null;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
