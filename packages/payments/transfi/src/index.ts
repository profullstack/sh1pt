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
// VERIFIED against TransFi's published API docs: Basic auth over
// `username:password`, the sandbox and production base URLs, and that
// `GET /v3/balance` returns 200 on good credentials and 401 on bad. connect()
// uses that endpoint as a real credential check rather than only asserting the
// secret is present in the vault.
//
// NOT VERIFIED: the payout request and response shapes. payout() validates its
// arguments and refuses to invent a transfer id, which is the same failure mode
// worldremit chose — a bad mapping surfaces as an error, never as a payment
// silently going nowhere.

interface Config {
  environment?: 'sandbox' | 'production';
}

const BASE_URL = {
  sandbox: 'https://api-sandbox.transfi.com',
  production: 'https://api.transfi.com',
} as const;

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

  async verifyWebhook(_ctx, rawBody): Promise<Webhook> {
    return { type: 'unknown', payload: JSON.parse(rawBody) };
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
    ],
    fields: [
      {
        key: 'TRANSFI_API_SECRET',
        message: 'TransFi API secret (the password half of the credential pair)',
        secret: true,
        required: true,
      },
      {
        key: 'environment',
        message: 'Environment — sandbox or production',
        required: false,
      },
    ],
  }),
});
