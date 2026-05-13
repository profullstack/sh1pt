import { createHmac, timingSafeEqual } from 'node:crypto';
import { definePayment, tokenSetup, type CheckoutRequest, type CheckoutSession, type Webhook } from '@profullstack/sh1pt-core';

// CoinPayPortal - default crypto-accepting payment provider in sh1pt.
// Uses the business configured coin list from CoinPayPortal and signs all
// webhook events with X-CoinPay-Signature.
interface Config {
  businessId?: string;
  merchantId?: string;               // Back-compat alias for businessId.
  acceptedCoins?: string[];          // Preferred business-enabled coins, e.g. ['USDC','SOL'].
  currency?: string;                 // CoinPay currency code, e.g. sol, usdc_sol.
  paymentMethod?: 'crypto' | 'card' | 'both';
  apiBaseUrl?: string;
  checkoutBaseUrl?: string;
  webhookSecret?: string;            // Read from vault if not set here.
  webhookToleranceSeconds?: number;
}

const DEFAULT_API_BASE = 'https://coinpayportal.com/api';
const DEFAULT_CHECKOUT_BASE = 'https://coinpayportal.com';

export default definePayment<Config>({
  id: 'payment-coinpay',
  label: 'CoinPayPortal (crypto — default)',
  supports: ['crypto', 'one-time', 'crowdfund'],

  async connect(ctx, config) {
    if (!ctx.secret('COINPAY_API_KEY')) throw new Error('COINPAY_API_KEY not in vault');
    const businessId = resolveBusinessId(config);
    ctx.log(`coinpay connected · business=${businessId ?? 'api-key default'}`);
    return { accountId: businessId ?? 'coinpay' };
  },

  async createCheckout(ctx, req, config) {
    if (req.kind === 'subscription') {
      throw new Error('CoinPayPortal does not expose merchant recurring subscriptions through /api/payments/create');
    }

    const apiKey = ctx.secret('COINPAY_API_KEY');
    if (!apiKey) throw new Error('COINPAY_API_KEY not in vault');

    ctx.log(`coinpay checkout · ${req.amount} ${req.currency} · ${req.kind}`);
    const supportedCurrencies = await fetchSupportedCurrencies(config, apiKey);
    const paymentCurrency = resolvePaymentCurrency(config, supportedCurrencies);
    const response = await coinpayRequest<CoinPayCreatePaymentResponse>(
      config,
      '/payments/create',
      apiKey,
      buildPaymentBody(req, config, paymentCurrency),
    );

    return checkoutSessionFromPayment(response, config);
  },

  async verifyWebhook(ctx, rawBody, signature, config): Promise<Webhook> {
    const secret = config.webhookSecret ?? ctx.secret('COINPAY_WEBHOOK_SECRET');
    if (!secret) throw new Error('COINPAY_WEBHOOK_SECRET not in vault');
    verifyCoinPaySignature(rawBody, signature, secret, config.webhookToleranceSeconds);

    return normalizeWebhook(JSON.parse(rawBody) as CoinPayWebhookEvent);
  },

  setup: tokenSetup<Config>({
    secretKey: 'COINPAY_API_KEY',
    label: 'CoinPay',
    vendorDocUrl: 'https://coinpayportal.com/docs',
    steps: [
      'Open CoinPayPortal → Business dashboard → API Keys',
      'Create an API key for your business',
      'Copy the API key + webhook secret',
    ],
    fields: [
      { key: 'COINPAY_WEBHOOK_SECRET', message: 'Paste the webhook signing secret:', secret: true },
      { key: 'businessId', message: 'Business ID:' },
    ],
  }),
});

function buildPaymentBody(req: CheckoutRequest, config: Config, paymentCurrency: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    business_id: resolveBusinessId(config),
    amount_usd: toUsdDecimal(req.amount, req.currency),
    currency: paymentCurrency,
    payment_method: config.paymentMethod ?? 'crypto',
    redirect_url: req.successUrl,
    cancel_url: req.cancelUrl,
    description: req.description,
    metadata: {
      ...req.metadata,
      customer_id: req.customerId,
      customer_email: req.customerEmail,
      connected_account_id: req.connectedAccountId,
      platform_fee_bps: req.platformFeeBps?.toString(),
      payment_rail: config.paymentMethod ?? 'crypto',
    },
  };

  return stripUndefined(body);
}

async function fetchSupportedCurrencies(config: Config, apiKey: string): Promise<string[]> {
  const businessId = resolveBusinessId(config);
  const query: Record<string, string> = { active_only: 'true' };
  if (businessId) query.business_id = businessId;
  const response = await coinpayGet<CoinPaySupportedCoinsResponse>(
    config,
    '/supported-coins',
    apiKey,
    query,
  );
  return supportedCurrenciesFromResponse(response);
}

async function coinpayGet<T>(
  config: Config,
  path: string,
  apiKey: string,
  query: Record<string, string>,
): Promise<T> {
  const url = new URL(`${apiBaseUrl(config)}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  });

  return readCoinPayJson<T>(response);
}

async function coinpayRequest<T>(
  config: Config,
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl(config)}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  return readCoinPayJson<T>(response);
}

async function readCoinPayJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({})) as CoinPayErrorResponse & T;
  if (!response.ok || json.success === false || json.ok === false) {
    const error = typeof json.error === 'string' ? json.error : json.error?.message;
    throw new Error(error ?? json.message ?? `CoinPay API error ${response.status}`);
  }
  return json as T;
}

function checkoutSessionFromPayment(response: CoinPayCreatePaymentResponse, config: Config): CheckoutSession {
  const payment = response.payment ?? response.data?.payment ?? response.data ?? response;
  const id = payment.id ?? payment.payment_id;
  if (!id) throw new Error('CoinPay payment response did not include id');

  const url = payment.checkout_url
    ?? payment.payment_url
    ?? payment.url
    ?? payment.stripe_checkout_url
    ?? `${checkoutBaseUrl(config)}/pay/${id}`;

  return {
    id,
    url,
    expiresAt: payment.expires_at,
  };
}

function verifyCoinPaySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): void {
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [key, value.join('=')];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('CoinPay signature missing t or v1');

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw new Error('CoinPay signature timestamp is invalid');
  if (toleranceSeconds > 0) {
    const age = Math.floor(Date.now() / 1000) - timestampSeconds;
    if (Math.abs(age) > toleranceSeconds) throw new Error('CoinPay webhook signature timestamp outside tolerance');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Invalid CoinPay webhook signature');
  }
}

function normalizeWebhook(event: CoinPayWebhookEvent): Webhook {
  const data = event.data ?? {};
  return {
    type: event.type ?? 'unknown',
    payload: event,
    paymentId: data.payment_id ?? event.id,
    status: normalizeStatus(data.status ?? event.type),
    amount: usdDecimalToMinor(data.amount_usd),
    currency: data.currency?.toUpperCase(),
    customerEmail: data.metadata?.customer_email,
  };
}

function normalizeStatus(status: string | undefined): Webhook['status'] | undefined {
  if (!status) return undefined;
  if (['confirmed', 'forwarded', 'succeeded', 'paid', 'payment.confirmed', 'payment.forwarded'].includes(status)) {
    return 'succeeded';
  }
  if (['pending', 'awaiting_payment', 'processing', 'created'].includes(status)) return 'pending';
  if (['expired', 'failed', 'cancelled', 'canceled', 'payment.expired'].includes(status)) return 'failed';
  if (status === 'refunded') return 'refunded';
  if (status === 'disputed') return 'disputed';
  return undefined;
}

function resolvePaymentCurrency(config: Config, supportedCurrencies: string[]): string {
  if (!supportedCurrencies.length) {
    throw new Error('CoinPayPortal business has no active supported coins');
  }

  if (config.currency) {
    const configured = normalizeCurrency(config.currency);
    if (!supportedCurrencies.includes(configured)) {
      throw new Error(`CoinPayPortal business does not support configured currency ${configured}`);
    }
    return configured;
  }

  for (const preference of config.acceptedCoins ?? []) {
    const preferred = normalizeCurrency(preference);
    const match = supportedCurrencies.find((currency) => matchesCoinPreference(currency, preferred));
    if (match) return match;
  }

  if (config.acceptedCoins?.length) {
    throw new Error(`CoinPayPortal business does not support preferred coins: ${config.acceptedCoins.join(', ')}`);
  }

  const fallback = supportedCurrencies[0];
  if (!fallback) throw new Error('CoinPayPortal business has no active supported coins');
  return fallback;
}

function toUsdDecimal(amount: number, currency: string): string {
  if (currency.toUpperCase() !== 'USD') {
    throw new Error('CoinPayPortal payment creation requires req.currency to be USD for amount_usd');
  }
  return (amount / 100).toFixed(2);
}

function usdDecimalToMinor(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function resolveBusinessId(config: Config): string | undefined {
  return config.businessId ?? config.merchantId;
}

function apiBaseUrl(config: Config): string {
  return (config.apiBaseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '');
}

function checkoutBaseUrl(config: Config): string {
  return (config.checkoutBaseUrl ?? DEFAULT_CHECKOUT_BASE).replace(/\/+$/, '');
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, stripUndefined(entry)]),
    ) as T;
  }
  return value;
}

function supportedCurrenciesFromResponse(response: CoinPaySupportedCoinsResponse): string[] {
  const coins = coinsFromResponse(response);
  return coins
    .filter((coin) => coin.is_active !== false && coin.active !== false && coin.has_wallet !== false)
    .map((coin) => coin.currency ?? coin.symbol ?? coin.code)
    .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.trim().length > 0)
    .map(normalizeCurrency);
}

function coinsFromResponse(response: CoinPaySupportedCoinsResponse): CoinPaySupportedCoin[] {
  if (response.coins) return response.coins;
  if (Array.isArray(response.data)) return response.data;
  return response.data?.coins ?? [];
}

function normalizeCurrency(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '_');
}

function matchesCoinPreference(currency: string, preferred: string): boolean {
  return currency === preferred || currency.startsWith(`${preferred}_`);
}

interface CoinPayErrorResponse {
  success?: boolean;
  ok?: boolean;
  message?: string;
  error?: { message?: string } | string;
}

interface CoinPayPayment {
  id?: string;
  payment_id?: string;
  checkout_url?: string;
  payment_url?: string;
  url?: string;
  stripe_checkout_url?: string;
  expires_at?: string;
}

type CoinPayCreatePaymentResponse = CoinPayPayment & {
  success?: boolean;
  ok?: boolean;
  payment?: CoinPayPayment;
  data?: CoinPayPayment & { payment?: CoinPayPayment };
};

interface CoinPaySupportedCoin {
  symbol?: string;
  currency?: string;
  code?: string;
  is_active?: boolean;
  active?: boolean;
  has_wallet?: boolean;
}

interface CoinPaySupportedCoinsResponse {
  success?: boolean;
  ok?: boolean;
  coins?: CoinPaySupportedCoin[];
  data?: CoinPaySupportedCoin[] | { coins?: CoinPaySupportedCoin[] };
}

interface CoinPayWebhookEvent {
  id?: string;
  type?: string;
  data?: {
    payment_id?: string;
    status?: string;
    amount_usd?: string | number;
    currency?: string;
    metadata?: {
      customer_email?: string;
    };
  };
}
