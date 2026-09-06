import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import adapter, {
  authHeader,
  normalizeTransfiWebhook,
  verifyTransfiSignature,
  TRANSFI_SIGNATURE_HEADER,
} from './index.js';

// transfi is a payouts adapter, not a checkout provider — supports[] is
// intentionally empty, same as worldremit. requireSupports skipped.
smokeTest(adapter, { idPrefix: 'payment', requireSupports: false });

const SECRET = 'whsec_test';
const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('payment-transfi auth', () => {
  it('builds Basic auth, not a bearer token', () => {
    // The sibling implementation in coinpayportal sent `Bearer <key>` and would
    // have 401'd on every request. Pinned here so this one cannot drift.
    expect(authHeader('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    expect(authHeader('user', 'pass')).not.toContain('Bearer');
  });

  it('encodes a colon in the password without splitting the pair', () => {
    const decoded = Buffer.from(authHeader('user', 'pa:ss').replace('Basic ', ''), 'base64').toString();

    expect(decoded).toBe('user:pa:ss');
  });
});

describe('verifyTransfiSignature', () => {
  const body = '{"eventId":"EV-1","status":"fund_settled"}';

  it('accepts a correctly signed body', () => {
    expect(() => verifyTransfiSignature(body, sign(body), SECRET)).not.toThrow();
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(() => verifyTransfiSignature(body, sign(body, 'nope'), SECRET)).toThrow(
      'Invalid TransFi webhook signature'
    );
  });

  it('rejects a body that changed after signing', () => {
    const signature = sign(body);

    expect(() => verifyTransfiSignature(`${body} `, signature, SECRET)).toThrow(
      'Invalid TransFi webhook signature'
    );
  });

  it('says so when the header is absent rather than failing obscurely', () => {
    expect(() => verifyTransfiSignature(body, '', SECRET)).toThrow('signature header is missing');
  });

  it('rejects a malformed signature instead of throwing from the comparison', () => {
    // timingSafeEqual throws on a length mismatch, which would read as a crash
    // rather than a rejected webhook.
    expect(() => verifyTransfiSignature(body, 'zzzz', SECRET)).toThrow(
      'Invalid TransFi webhook signature'
    );
    expect(() => verifyTransfiSignature(body, 'ab', SECRET)).toThrow(
      'Invalid TransFi webhook signature'
    );
  });

  it('tolerates surrounding whitespace on the header value', () => {
    expect(() => verifyTransfiSignature(body, `  ${sign(body)}  `, SECRET)).not.toThrow();
  });

  it('names the header in lowercase, because Node lowercases them', () => {
    // TransFi's own sample reads req.headers['X-Transfi-Hmac-Hash'], which is
    // always undefined in Node.
    expect(TRANSFI_SIGNATURE_HEADER).toBe('x-transfi-hmac-hash');
  });
});

describe('normalizeTransfiWebhook', () => {
  // Payload shapes taken verbatim from TransFi's payout event docs.
  const settled = {
    eventId: 'EV-260824094702778',
    entityId: 'OR-260824094625490386520298764',
    status: 'fund_settled',
    order: {
      orderId: 'OR-260824094625490386520298764',
      depositCurrency: 'IDR',
      depositAmount: 214721,
      withdrawCurrency: 'USDTPOLYGON',
      withdrawAmount: 12,
    },
  };

  it('maps a settled fiat payout to succeeded', () => {
    const hook = normalizeTransfiWebhook(settled);

    expect(hook.status).toBe('succeeded');
    expect(hook.paymentId).toBe('OR-260824094625490386520298764');
    // The withdraw side: what left TransFi toward the recipient.
    expect(hook.amount).toBe(12);
    expect(hook.currency).toBe('USDTPOLYGON');
  });

  it('maps a settled crypto payout to succeeded', () => {
    expect(normalizeTransfiWebhook({ ...settled, status: 'asset_deposited' }).status).toBe('succeeded');
  });

  it('treats a scheduled payout as pending, not delivered', () => {
    // The order is booked; the recipient has nothing yet.
    expect(normalizeTransfiWebhook({ ...settled, status: 'fund_scheduled' }).status).toBe('pending');
    expect(normalizeTransfiWebhook({ ...settled, status: 'initiated' }).status).toBe('pending');
  });

  it('maps both failure vocabularies', () => {
    expect(normalizeTransfiWebhook({ ...settled, status: 'fund_failed' }).status).toBe('failed');
    expect(normalizeTransfiWebhook({ ...settled, status: 'fund_deposit_failed' }).status).toBe('failed');
  });

  it('maps an unknown status to pending, never to a confident answer', () => {
    // Both confident answers are harmful: one reports a payout as delivered,
    // the other tells someone their money bounced when it did not.
    expect(normalizeTransfiWebhook({ ...settled, status: 'some_new_status' }).status).toBe('pending');
  });

  it('is case-insensitive about the status', () => {
    expect(normalizeTransfiWebhook({ ...settled, status: 'FUND_SETTLED' }).status).toBe('succeeded');
  });

  it('falls back to entityId when the order has no orderId', () => {
    const hook = normalizeTransfiWebhook({ entityId: 'OR-9', status: 'initiated' });

    expect(hook.paymentId).toBe('OR-9');
    expect(hook.amount).toBeUndefined();
  });

  it('keeps the raw payload so the deposit side is not lost', () => {
    // TransFi's samples label deposit/withdraw in a way that is easy to read
    // backwards, so callers that care must be able to check the raw fields.
    expect((normalizeTransfiWebhook(settled).payload as typeof settled).order.depositAmount).toBe(214721);
  });
});

describe('payment-transfi verifyWebhook', () => {
  const ctx = (secrets: Record<string, string>) => ({ secret: (k: string) => secrets[k] });

  it('refuses to verify without a secret rather than accepting anything', async () => {
    await expect(
      adapter.verifyWebhook(ctx({}), '{}', sign('{}'), {})
    ).rejects.toThrow('TRANSFI_WEBHOOK_SECRET not in vault');
  });

  it('verifies and normalizes end to end', async () => {
    const body = JSON.stringify({ status: 'fund_settled', order: { orderId: 'OR-1', withdrawAmount: 5, withdrawCurrency: 'NGN' } });
    const hook = await adapter.verifyWebhook(ctx({ TRANSFI_WEBHOOK_SECRET: SECRET }), body, sign(body), {});

    expect(hook.status).toBe('succeeded');
    expect(hook.paymentId).toBe('OR-1');
    expect(hook.currency).toBe('NGN');
  });

  it('takes the secret from config ahead of the vault', async () => {
    const body = '{"status":"initiated"}';
    const hook = await adapter.verifyWebhook(ctx({}), body, sign(body, 'cfg'), { webhookSecret: 'cfg' });

    expect(hook.status).toBe('pending');
  });

  it('rejects a forged delivery', async () => {
    await expect(
      adapter.verifyWebhook(ctx({ TRANSFI_WEBHOOK_SECRET: SECRET }), '{"status":"fund_settled"}', 'deadbeef', {})
    ).rejects.toThrow('Invalid TransFi webhook signature');
  });
});

describe('payment-transfi checkout', () => {
  it('refuses buyer-facing checkout and says what to use instead', async () => {
    await expect(
      adapter.createCheckout({ secret: () => undefined, log: () => {} }, {} as never, {})
    ).rejects.toThrow('does not support buyer-facing checkout');
  });
});

describe('payment-transfi payout validation', () => {
  it('rejects missing payout recipients', async () => {
    await expect(adapter.payout!('   ', 1000, 'USD', {})).rejects.toThrow('recipient accountId is required');
  });

  it('rejects invalid payout amounts', async () => {
    await expect(adapter.payout!('recipient-1', 0, 'USD', {})).rejects.toThrow('positive finite number');
    await expect(adapter.payout!('recipient-1', Number.NaN, 'USD', {})).rejects.toThrow('positive finite number');
  });

  it('rejects malformed payout currencies', async () => {
    await expect(adapter.payout!('recipient-1', 1000, 'US', {})).rejects.toThrow('3-letter ISO code');
  });

  it('refuses rather than fabricating a transfer id', async () => {
    await expect(adapter.payout!('recipient-1', 1000, 'USD', {})).rejects.toThrow('not implemented yet');
  });
});

describe('payment-transfi connect', () => {
  const ctx = (secrets: Record<string, string>) => ({
    secret: (k: string) => secrets[k],
    log: () => {},
  });

  it('names the missing half of the credential pair', async () => {
    await expect(adapter.connect(ctx({}), {})).rejects.toThrow('TRANSFI_API_KEY not in vault');
    await expect(adapter.connect(ctx({ TRANSFI_API_KEY: 'u' }), {})).rejects.toThrow(
      'TRANSFI_API_SECRET not in vault'
    );
  });
});
