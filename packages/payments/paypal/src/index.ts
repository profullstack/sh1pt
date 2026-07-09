import { definePayment, tokenSetup, type CheckoutRequest, type CheckoutSession, type Webhook } from '@profullstack/sh1pt-core';

interface Config {
  clientId?: string;
  environment?: 'sandbox' | 'live';
  apiBaseUrl?: string;
  brandName?: string;
  userAction?: 'PAY_NOW' | 'CONTINUE';
  webhookId?: string;
}

interface PayPalAccessToken {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface PayPalLink {
  href?: string;
  rel?: string;
  method?: string;
}

interface PayPalCheckoutResponse {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
}

interface PayPalVerifyWebhookResponse {
  verification_status?: 'SUCCESS' | 'FAILURE';
  name?: string;
  message?: string;
}

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: {
      value?: string;
      currency_code?: string;
    };
    seller_receivable_breakdown?: {
      gross_amount?: {
        value?: string;
        currency_code?: string;
      };
    };
    payer?: {
      email_address?: string;
    };
    subscriber?: {
      email_address?: string;
    };
  };
}

interface PayPalSignatureHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

const PAYPAL_LIVE_API = 'https://api-m.paypal.com';
const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';

export default definePayment<Config>({
  id: 'payment-paypal',
  label: 'PayPal',
  supports: ['one-time', 'subscription'],

  async connect(ctx, config) {
    const clientId = resolveClientId(ctx, config);
    if (!clientId || !ctx.secret('PAYPAL_CLIENT_SECRET')) {
      throw new Error('PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET required in vault');
    }
    return { accountId: clientId };
  },

  async createCheckout(ctx, req, config) {
    if (req.kind === 'subscription') {
      return createSubscription(ctx, req, config);
    }
    if (req.kind !== 'one-time') {
      throw new Error(`PayPal checkout does not support payment kind: ${req.kind}`);
    }
    return createOrder(ctx, req, config);
  },

  async verifyWebhook(ctx, rawBody, signature, config): Promise<Webhook> {
    const webhookId = config.webhookId ?? ctx.secret('PAYPAL_WEBHOOK_ID');
    if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID not in vault');

    const event = parseJson<PayPalWebhookEvent>(rawBody);
    const headers = parseSignatureHeaders(signature);
    const verification = await paypalJsonRequest<PayPalVerifyWebhookResponse>(ctx, config, '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    });

    if (verification.verification_status !== 'SUCCESS') {
      throw new Error(verification.message ?? 'PayPal webhook signature verification failed');
    }

    return normalizeWebhook(event);
  },

  setup: tokenSetup<Config>({
    secretKey: 'PAYPAL_CLIENT_SECRET',
    label: 'PayPal',
    vendorDocUrl: 'https://developer.paypal.com/dashboard/applications',
    steps: [
      'Open developer.paypal.com -> My Apps & Credentials',
      'Create a REST API app (Sandbox for testing, Live for production)',
      'Copy the Client ID and Secret',
      'Create a webhook and copy its webhook ID if you need event verification',
    ],
    fields: [
      { key: 'clientId', message: 'PayPal Client ID:', required: true },
      { key: 'environment', message: 'Environment (sandbox or live):' },
      { key: 'PAYPAL_WEBHOOK_ID', message: 'PayPal webhook ID:', secret: true },
    ],
  }),
});

async function createOrder(
  ctx: { secret(k: string): string | undefined; log(m: string): void },
  req: CheckoutRequest,
  config: Config,
): Promise<CheckoutSession> {
  ctx.log(`paypal order · ${req.amount} ${req.currency}`);
  const currency = req.currency.toUpperCase();
  const response = await paypalJsonRequest<PayPalCheckoutResponse>(ctx, config, '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: currency,
          value: formatMinorAmount(req.amount, currency),
        },
        description: req.description,
        custom_id: req.metadata?.order_id ?? req.metadata?.orderId,
        invoice_id: req.metadata?.invoice_id ?? req.metadata?.invoiceId,
      },
    ],
    application_context: buildApplicationContext(req, config),
  });

  return checkoutSessionFromResponse(response, 'PayPal order');
}

async function createSubscription(
  ctx: { secret(k: string): string | undefined; log(m: string): void },
  req: CheckoutRequest,
  config: Config,
): Promise<CheckoutSession> {
  if (!req.priceId) throw new Error('PayPal subscriptions require req.priceId to contain the PayPal plan_id');

  ctx.log(`paypal subscription · ${req.priceId}`);
  const response = await paypalJsonRequest<PayPalCheckoutResponse>(ctx, config, '/v1/billing/subscriptions', {
    plan_id: req.priceId,
    custom_id: req.metadata?.order_id ?? req.metadata?.orderId,
    subscriber: req.customerEmail ? { email_address: req.customerEmail } : undefined,
    application_context: buildApplicationContext(req, config),
  });

  return checkoutSessionFromResponse(response, 'PayPal subscription');
}

function buildApplicationContext(req: CheckoutRequest, config: Config): Record<string, unknown> {
  return {
    return_url: req.successUrl,
    cancel_url: req.cancelUrl,
    brand_name: config.brandName,
    user_action: config.userAction ?? (req.kind === 'one-time' ? 'PAY_NOW' : 'SUBSCRIBE_NOW'),
    shipping_preference: 'NO_SHIPPING',
  };
}

async function paypalJsonRequest<T>(
  ctx: { secret(k: string): string | undefined },
  config: Config,
  path: string,
  body: unknown,
): Promise<T> {
  const accessToken = await getAccessToken(ctx, config);
  const response = await fetch(`${apiBaseUrl(config)}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(stripUndefined(body)),
  });

  return readPayPalJson<T>(response);
}

async function getAccessToken(ctx: { secret(k: string): string | undefined }, config: Config): Promise<string> {
  const clientId = resolveClientId(ctx, config);
  const clientSecret = ctx.secret('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET required in vault');
  }

  const response = await fetch(`${apiBaseUrl(config)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  const token = await readPayPalJson<PayPalAccessToken>(response);
  if (!token.access_token) {
    throw new Error(token.error_description ?? token.error ?? 'PayPal access token response did not include access_token');
  }
  return token.access_token;
}

async function readPayPalJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({})) as T & PayPalCheckoutResponse & PayPalAccessToken;
  if (!response.ok) {
    const details = json.details?.map((detail) => detail.description ?? detail.issue).filter(Boolean).join('; ');
    const message = details || json.message || json.error_description || json.error || `PayPal API error ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

function checkoutSessionFromResponse(response: PayPalCheckoutResponse, subject: string): CheckoutSession {
  const id = response.id;
  const url = response.links?.find((link) => link.rel === 'approve')?.href;
  if (!id || !url) throw new Error(`${subject} response did not include id and approve link`);
  return { id, url };
}

function resolveClientId(ctx: { secret(k: string): string | undefined }, config: Config): string | undefined {
  return config.clientId ?? ctx.secret('PAYPAL_CLIENT_ID');
}

function apiBaseUrl(config: Config): string {
  if (config.apiBaseUrl) return config.apiBaseUrl.replace(/\/+$/, '');
  return config.environment === 'live' ? PAYPAL_LIVE_API : PAYPAL_SANDBOX_API;
}

function formatMinorAmount(amount: number, currency: string): string {
  const decimals = minorUnit(currency);
  return (amount / (10 ** decimals)).toFixed(decimals);
}

function amountToMinor(value: string | undefined, currency: string | undefined): number | undefined {
  if (!value || !currency) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * (10 ** minorUnit(currency)));
}

function minorUnit(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

function parseSignatureHeaders(signature: string): PayPalSignatureHeaders {
  const raw = signature.trim();
  const data = raw.startsWith('{')
    ? JSON.parse(raw) as Record<string, string>
    : Object.fromEntries(raw.split(/[;,]/).map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key?.toLowerCase(), value.join('=')];
    }));

  const normalized = new Map(
    Object.entries(data).map(([key, value]) => [key.toLowerCase().replace(/^paypal-/, '').replace(/[-_]/g, ''), value]),
  );
  const headers = {
    authAlgo: normalized.get('authalgo'),
    certUrl: normalized.get('certurl'),
    transmissionId: normalized.get('transmissionid'),
    transmissionSig: normalized.get('transmissionsig'),
    transmissionTime: normalized.get('transmissiontime'),
  };

  if (!headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) {
    throw new Error('PayPal webhook signature is missing required transmission headers');
  }
  return headers as PayPalSignatureHeaders;
}

function normalizeWebhook(event: PayPalWebhookEvent): Webhook {
  const resource = event.resource ?? {};
  const amount = resource.amount ?? resource.seller_receivable_breakdown?.gross_amount;
  return {
    type: event.event_type ?? 'unknown',
    payload: event,
    paymentId: resource.id ?? event.id,
    status: normalizePayPalStatus(event.event_type, resource.status),
    amount: amountToMinor(amount?.value, amount?.currency_code),
    currency: amount?.currency_code?.toUpperCase(),
    customerEmail: resource.payer?.email_address ?? resource.subscriber?.email_address,
  };
}

function normalizePayPalStatus(eventType: string | undefined, resourceStatus: string | undefined): Webhook['status'] | undefined {
  const text = `${eventType ?? ''} ${resourceStatus ?? ''}`.toUpperCase();
  if (text.includes('REFUND')) return 'refunded';
  if (text.includes('DISPUTE')) return 'disputed';
  if (text.includes('COMPLETED') || text.includes('APPROVED') || text.includes('ACTIVE')) return 'succeeded';
  if (text.includes('DENIED') || text.includes('FAILED') || text.includes('VOIDED') || text.includes('CANCELLED') || text.includes('CANCELED')) return 'failed';
  if (text.includes('PENDING') || text.includes('CREATED')) return 'pending';
  return undefined;
}

function parseJson<T>(rawBody: string): T {
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new Error('PayPal webhook body is not valid JSON');
  }
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)]),
  );
}
