import { createHmac } from 'node:crypto';
import { definePayment, tokenSetup, type Webhook } from '@profullstack/sh1pt-core';

// Bitnob — African payouts, funded from stablecoin or fiat, delivered over the
// rail the recipient actually uses: NIP in Nigeria, M-Pesa in Kenya and
// Tanzania, MTN MoMo in Ghana and Uganda, PayShap or EFT in South Africa. A
// sending rail like transfi and worldremit, not a buyer-facing checkout.
//
// Worth knowing when choosing between this and transfi: Bitnob's KYB review is
// typically 24–48 hours, against TransFi's 1–14 business days. For getting a
// single African corridor genuinely live, this is the faster route to a
// PRODUCTION key. TransFi is the breadth partner for everywhere else.
//
// VERIFIED against Bitnob's published docs: the request signing scheme
// (`CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD`, HMAC-SHA256 keyed with the client
// secret, hex, across four `X-Auth-*` headers) and that one base URL serves
// both environments.
//
// NOT VERIFIED: the payout request and response shapes. payout() validates and
// then refuses rather than inventing a transfer id.

interface Config {
  /**
   * Which Bitnob environment these credentials belong to.
   *
   * Required, and deliberately not defaulted. Bitnob serves sandbox and
   * production from the SAME base URL — the key alone decides which world you
   * are in — so unlike every other adapter here there is no host to eyeball and
   * nothing in a request or response that reveals a sandbox key has been
   * deployed to production. It would quote invented prices to real customers
   * and look entirely healthy doing it.
   *
   * Making this explicit is the only available guard.
   */
  environment?: 'sandbox' | 'production';
}

// One URL for both environments. This is not an oversight; see Config above.
const BITNOB_API_URL = 'https://api.bitnob.com';
const QUOTE_PATH = '/api/payouts/quotes';

/**
 * Bitnob's four `X-Auth-*` headers.
 *
 * The canonical string is `CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD` joined with
 * colons, signed HMAC-SHA256 with the client secret, hex-encoded. Exported so a
 * test can assert the exact bytes: a subtly wrong canonical string fails as a
 * 401, which reads as a bad credential rather than as our bug.
 */
export function signRequest(
  clientId: string,
  clientSecret: string,
  payload: string,
  nowSeconds: number,
  nonce: string
): Record<string, string> {
  const message = `${clientId}:${nowSeconds}:${nonce}:${payload}`;

  return {
    'X-Auth-Client': clientId,
    'X-Auth-Timestamp': String(nowSeconds),
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': createHmac('sha256', clientSecret).update(message).digest('hex'),
  };
}

/**
 * Refuse to run against production without saying so out loud.
 *
 * Throws rather than assuming, because the assumption that costs money is
 * "probably production" on a sandbox key.
 */
export function requireEnvironment(config: Config): 'sandbox' | 'production' {
  if (config.environment !== 'sandbox' && config.environment !== 'production') {
    throw new Error(
      "Bitnob environment must be set to 'sandbox' or 'production'. Bitnob serves both from one URL, so a sandbox key deployed to production quotes invented prices and looks healthy doing it."
    );
  }
  return config.environment;
}

export default definePayment<Config>({
  id: 'payment-bitnob',
  label: 'Bitnob (African payouts)',
  supports: [], // sending rail, not a buyer-facing checkout

  async connect(ctx, config) {
    const environment = requireEnvironment(config);
    const clientId = ctx.secret('BITNOB_CLIENT_ID');
    const clientSecret = ctx.secret('BITNOB_CLIENT_SECRET');
    if (!clientId) throw new Error('BITNOB_CLIENT_ID not in vault');
    if (!clientSecret) throw new Error('BITNOB_CLIENT_SECRET not in vault');

    ctx.log(`bitnob connected · ${environment}`);
    return { accountId: 'bitnob' };
  },

  async createCheckout() {
    throw new Error('payment-bitnob does not support buyer-facing checkout — use payout()');
  },

  async verifyWebhook(_ctx, rawBody): Promise<Webhook> {
    return { type: 'unknown', payload: JSON.parse(rawBody) };
  },

  async payout(accountId, amount, currency, config) {
    requireEnvironment(config);

    const recipient = accountId.trim();
    if (!recipient) throw new Error('Bitnob payout recipient accountId is required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Bitnob payout amount must be a positive finite number');
    }
    if (!/^[a-z]{3}$/i.test(currency)) {
      throw new Error('Bitnob payout currency must be a 3-letter ISO code');
    }

    // Not implemented against a guessed request shape: a fabricated transfer id
    // would report money as sent when nothing left the account.
    throw new Error(
      'Bitnob payout is not implemented yet — the request shape is unverified. Run a sandbox payout first, then wire it here.'
    );
  },

  setup: tokenSetup<Config>({
    secretKey: 'BITNOB_CLIENT_ID',
    label: 'Bitnob',
    vendorDocUrl: 'https://app.bitnob.com',
    steps: [
      'Bitnob is the FASTEST route to a production African payout key:',
      'KYB review is typically 24-48 hours (TransFi is 1-14 business days)',
      '',
      'Sign up for a Bitnob Business account at app.bitnob.com',
      'Complete KYB: business identity, ownership and legitimacy',
      'KYB is mandatory before API access — sandbox keys are issued instantly,',
      '  but they are for testing only and must never reach production',
      'Once verified, go to Settings -> API Keys for your dedicated keys',
      '',
      'Both halves are required: the client ID and the client secret.',
      'Requests are HMAC-signed, so an ID without its secret cannot authenticate.',
    ],
    fields: [
      {
        key: 'BITNOB_CLIENT_SECRET',
        message: 'Bitnob client secret (signing key — required)',
        secret: true,
        required: true,
      },
      {
        key: 'environment',
        message:
          "Environment — 'sandbox' or 'production'. Required: Bitnob serves both from one URL, so nothing else can catch a sandbox key in production",
        required: true,
      },
    ],
  }),
});

export { BITNOB_API_URL, QUOTE_PATH };
