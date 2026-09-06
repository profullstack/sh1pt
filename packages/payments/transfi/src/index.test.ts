import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter, { authHeader } from './index.js';

// transfi is a payouts adapter, not a checkout provider — supports[] is
// intentionally empty, same as worldremit. requireSupports skipped.
smokeTest(adapter, { idPrefix: 'payment', requireSupports: false });

describe('payment-transfi auth', () => {
  it('builds Basic auth, not a bearer token', () => {
    // The sibling implementation in coinpayportal sent `Bearer <key>` and would
    // have 401'd on every request. Pinned here so this one cannot drift the
    // same way.
    expect(authHeader('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    expect(authHeader('user', 'pass')).not.toContain('Bearer');
  });

  it('encodes a colon in the password without splitting the pair', () => {
    // Base64 of the whole string; only the FIRST colon separates the two
    // halves, so a password containing one must survive intact.
    const header = authHeader('user', 'pa:ss');
    const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString();

    expect(decoded).toBe('user:pa:ss');
  });
});

describe('payment-transfi checkout', () => {
  it('refuses buyer-facing checkout and says what to use instead', async () => {
    await expect(adapter.createCheckout({ secret: () => undefined, log: () => {} }, {} as never, {})).rejects.toThrow(
      'does not support buyer-facing checkout'
    );
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
    // A made-up id would report money as sent when nothing left the account.
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
