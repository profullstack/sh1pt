import { createHmac, timingSafeEqual } from 'node:crypto';
import { definePayment, tokenSetup, type Webhook } from '@profullstack/sh1pt-core';

// TransFi — cross-border payouts in ~100 countries, funded from stablecoin or
// fiat. Like worldremit this is a SENDING rail, not a checkout provider: use it
// to pay contractors, creators or marketplace sellers into their local bank or
// wallet. TransFi also sells a Collections product for taking money in; that is
// not wired here.
//
// Unlike worldremit, onboarding is self-serve — sign up, clear KYB, and the
// dashboard issues sandbox and production credentials without a sales call.
// That is the whole reason this adapter exists: `sh1pt config payments` can
// walk the operator through it and verify the result, which is not possible
// for a provider that only issues credentials over email.
//
// VERIFIED against TransFi's published docs: Basic auth over
// `username:password`; the sandbox and production base URLs; that
// `GET /v3/balance` returns 200 on good credentials and 401 on bad; the webhook
// signature scheme; and the payout event statuses mapped below.
//
// NOT VERIFIED: the payout *request* shape. payout() validates its arguments
// and then refuses rather than inventing a transfer id — a fabricated id would
// report money as sent when nothing left the account.

interface Config {
  environment?: 'sandbox' | 'production';
  webhookSecret?: string; // read from the vault when not set here
}

const BASE_URL = {
  sandbox: 'https://api-sandbox.transfi.com',
  production: 'https://api.transfi.com',
} as const;

/**
 * The header TransFi puts its signature in.
 *
 * Exported because it is easy to get wrong: TransFi's own documented sample
 * reads `req.headers['X-Transfi-Hmac-Hash']`, which is always `undefined` in
 * Node — it lowercases incoming header names. Anything routing webhooks to this
 * adapter should look the header up case-insensitively.
 */
export const TRANSFI_SIGNATURE_HEADER = 'x-transfi-hmac-hash';

function baseUrl(config: Config): string {
  return BASE_URL[config.environment ?? 'production'];
}

/**
 * TransFi's Basic auth header.
 *
 * Base64 of `username:password`, NOT a bearer token. Worth stating loudly: a
 * sibling implementation of this same API in coinpayportal sent
 * `Authorization: Bearer <key>` and would have failed every request the moment
 * a real credential was configured. The 401 that produces looks identical to an
 * expired key, so it is the kind of mistake that survives a long time.
 */
export function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/**
 * Verify a TransFi webhook signature.
 *
 * HMAC-SHA256 over the raw request body, keyed with the dedicated webhook
 * secret, hex-encoded, compared against `X-Transfi-Hmac-Hash`.
 *
 * Two deliberate departures from TransFi's documented sample. It compares with
 * {@link timingSafeEqual} rather than `===`, because a byte-by-byte string
 * compare leaks how much of a forged signature was correct. And it takes the
 * body as the exact bytes that arrived: any re-serialisation — parsing to JSON
 * and stringifying again — changes whitespace or key order and the hash stops
 * matching, which is the single most common way this check gets wrongly
 * reported as broken.
 */
export function verifyTransfiSignature(rawBody: string, signature: string, secret: string): void {
  if (!signature) throw new Error('TransFi webhook signature header is missing');

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  let actualBuffer: Buffer;
  try {
    actualBuffer = Buffer.from(signature.trim(), 'hex');
  } catch {
    throw new Error('Invalid TransFi webhook signature');
  }

  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and that throw would read as a crash instead of a
  // rejected webhook.
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Invalid TransFi webhook signature');
  }
}

/**
 * TransFi payout statuses, mapped onto sh1pt's normalized set.
 *
 * Fiat and crypto payouts have different vocabularies for the same three
 * moments, so both appear here. `fund_scheduled` is pending rather than
 * succeeded: the order is booked, the recipient has nothing yet.
 */
const PAYOUT_STATUS: Record<string, Webhook['status']> = {
  initiated: 'pending',
  fund_scheduled: 'pending',
  fund_settled: 'succeeded',
  asset_deposited: 'succeeded',
  fund_failed: 'failed',
  fund_deposit_failed: 'failed',
};

interface TransfiWebhookPayload {
  eventId?: string;
  entityId?: string;
  entityType?: string;
  status?: string;
  order?: {
    orderId?: string;
    depositCurrency?: string;
    depositAmount?: number | string;
    withdrawCurrency?: string;
    withdrawAmount?: number | string;
  };
  [key: string]: unknown;
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * Map a TransFi webhook onto sh1pt's normalized shape.
 *
 * The amount reported is the **withdraw** side — what leaves TransFi toward the
 * recipient — because that is the number a payout is about. The deposit side is
 * what we funded it with. Both survive untouched in `payload`, which matters:
 * TransFi's own sample payloads label these in a way that is easy to read
 * backwards, so anything depending on the distinction should check the raw
 * fields rather than trust this one.
 *
 * An unrecognised status becomes `pending`, never `succeeded` or `failed`.
 * TransFi can add statuses without asking us, and both of the confident answers
 * are harmful: one would report a payout as delivered, the other would tell
 * someone their money bounced when it had not.
 */
export function normalizeTransfiWebhook(payload: TransfiWebhookPayload): Webhook {
  const status = payload.status ? PAYOUT_STATUS[payload.status.toLowerCase()] ?? 'pending' : undefined;

  return {
    type: payload.status ?? payload.entityType ?? 'unknown',
    payload,
    paymentId: payload.order?.orderId ?? payload.entityId,
    status,
    amount: toFiniteNumber(payload.order?.withdrawAmount),
    currency: payload.order?.withdrawCurrency,
  };
}

export default definePayment<Config>({
  id: 'payment-transfi',
  label: 'TransFi (cross-border payouts)',
  supports: [], // sending rail, not a buyer-facing checkout

  async connect(ctx, config) {
    const username = ctx.secret('TRANSFI_API_KEY');
    const password = ctx.secret('TRANSFI_API_SECRET');
    if (!username) throw new Error('TRANSFI_API_KEY not in vault');
    if (!password) throw new Error('TRANSFI_API_SECRET not in vault');

    // A real check, not a presence check. Credentials that are present but
    // wrong are the failure this catches, and they are indistinguishable from
    // correct ones until something tries to move money.
    const response = await fetch(`${baseUrl(config)}/v3/balance`, {
      headers: { Authorization: authHeader(username, password) },
    });

    if (response.status === 401) {
      throw new Error(
        'TransFi rejected these credentials (401). Check they are the right environment — sandbox and production keys are separate.'
      );
    }
    if (!response.ok) {
      throw new Error(`TransFi API error ${response.status} while verifying credentials`);
    }

    ctx.log(`transfi connected · ${config.environment ?? 'production'}`);
    return { accountId: 'transfi' };
  },

  async createCheckout() {
    throw new Error(
      'payment-transfi does not support buyer-facing checkout — use payout(), or TransFi Collections which is not wired here'
    );
  },

  async verifyWebhook(ctx, rawBody, signature, config): Promise<Webhook> {
    const secret = config.webhookSecret ?? ctx.secret('TRANSFI_WEBHOOK_SECRET');
    if (!secret) throw new Error('TRANSFI_WEBHOOK_SECRET not in vault');

    verifyTransfiSignature(rawBody, signature, secret);

    return normalizeTransfiWebhook(JSON.parse(rawBody) as TransfiWebhookPayload);
  },

  async payout(accountId, amount, currency) {
    const recipient = accountId.trim();
    if (!recipient) throw new Error('TransFi payout recipient accountId is required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('TransFi payout amount must be a positive finite number');
    }
    if (!/^[a-z]{3}$/i.test(currency)) {
      throw new Error('TransFi payout currency must be a 3-letter ISO code');
    }

    // Deliberately not implemented against a guessed request shape. Returning a
    // fabricated id here would report a payout as sent when nothing left the
    // account, which is worse than refusing.
    throw new Error(
      'TransFi payout is not implemented yet — the request shape is unverified. Run a sandbox payout first, then wire it here.'
    );
  },

  setup: tokenSetup<Config>({
    secretKey: 'TRANSFI_API_KEY',
    label: 'TransFi',
    // Opens the signup page. Self-serve: no sales call, unlike WorldRemit.
    vendorDocUrl: 'https://www.transfi.com/signup',
    steps: [
      'Sign up for a TransFi business account (self-serve — no sales call)',
      'Complete KYB: company details, regulatory info, beneficial ownership',
      'Once approved, sign in to displai.transfi.com',
      'Go to Settings → API Credentials',
      'Sandbox and production have SEPARATE credential pairs — copy the one you want',
      'The username is the API key and the password is the API secret; both are needed',
      '',
      'The webhook secret is available BEFORE KYB clears:',
      'Settings → Webhooks → create a listener and copy its dedicated secret',
      'Point the listener at your handler; TransFi signs each delivery with it',
    ],
    fields: [
      {
        key: 'TRANSFI_API_SECRET',
        message: 'TransFi API secret (the password half of the credential pair)',
        secret: true,
        required: true,
      },
      {
        key: 'TRANSFI_WEBHOOK_SECRET',
        message: 'TransFi webhook secret (Settings → Webhooks — available before KYB)',
        secret: true,
        required: false,
      },
      {
        key: 'environment',
        message: 'Environment — sandbox or production',
        required: false,
      },
    ],
  }),
});
