import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import adapter, { signRequest, requireEnvironment, BITNOB_API_URL } from './index.js';

// bitnob is a payouts adapter, not a checkout provider — supports[] is
// intentionally empty, same as transfi and worldremit.
smokeTest(adapter, { idPrefix: 'payment', requireSupports: false });

describe('signRequest', () => {
  it('signs the documented canonical string', () => {
    // CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD, HMAC-SHA256, hex. Pinned to exact
    // bytes: a subtly wrong canonical string fails as a 401, which reads as a
    // bad credential rather than as our bug.
    const headers = signRequest('client-1', 'secret-1', '{"a":1}', 1_719_236_465, 'deadbeef');

    expect(headers['X-Auth-Signature']).toBe(
      createHmac('sha256', 'secret-1').update('client-1:1719236465:deadbeef:{"a":1}').digest('hex')
    );
    expect(headers['X-Auth-Client']).toBe('client-1');
    expect(headers['X-Auth-Timestamp']).toBe('1719236465');
    expect(headers['X-Auth-Nonce']).toBe('deadbeef');
  });

  it('signs an empty payload as the empty string, not "undefined"', () => {
    expect(signRequest('c', 's', '', 1_000, 'n')['X-Auth-Signature']).toBe(
      createHmac('sha256', 's').update('c:1000:n:').digest('hex')
    );
  });

  it('changes when only the nonce changes', () => {
    const a = signRequest('c', 's', '{}', 1_000, 'one');
    const b = signRequest('c', 's', '{}', 1_000, 'two');

    expect(a['X-Auth-Signature']).not.toBe(b['X-Auth-Signature']);
  });
});

describe('requireEnvironment', () => {
  // The guard that matters. Bitnob serves sandbox and production from ONE base
  // URL, so nothing in a request, a response or a hostname reveals that a
  // sandbox key reached production — it would quote invented prices to real
  // customers and look entirely healthy doing it.
  it('serves both environments from a single URL', () => {
    expect(BITNOB_API_URL).toBe('https://api.bitnob.com');
    expect(BITNOB_API_URL).not.toContain('sandbox');
  });

  it('accepts an explicit environment', () => {
    expect(requireEnvironment({ environment: 'sandbox' })).toBe('sandbox');
    expect(requireEnvironment({ environment: 'production' })).toBe('production');
  });

  it('refuses to guess when the environment is absent', () => {
    // Never defaults. The assumption that costs money is "probably production"
    // on a sandbox key.
    expect(() => requireEnvironment({})).toThrow(/must be set/);
  });

  it('refuses a value that is neither', () => {
    expect(() => requireEnvironment({ environment: 'prod' as never })).toThrow(/must be set/);
    expect(() => requireEnvironment({ environment: '' as never })).toThrow(/must be set/);
  });

  it('explains the consequence rather than just the rule', () => {
    // A guard nobody understands gets deleted by the next person in a hurry.
    expect(() => requireEnvironment({})).toThrow(/one URL/);
  });
});

describe('payment-bitnob connect', () => {
  const ctx = (secrets: Record<string, string>) => ({
    secret: (k: string) => secrets[k],
    log: () => {},
  });

  it('demands the environment before it even looks at credentials', async () => {
    await expect(
      adapter.connect(ctx({ BITNOB_CLIENT_ID: 'c', BITNOB_CLIENT_SECRET: 's' }), {})
    ).rejects.toThrow(/must be set/);
  });

  it('names the missing half of the credential pair', async () => {
    const config = { environment: 'sandbox' as const };

    await expect(adapter.connect(ctx({}), config)).rejects.toThrow('BITNOB_CLIENT_ID not in vault');
    await expect(adapter.connect(ctx({ BITNOB_CLIENT_ID: 'c' }), config)).rejects.toThrow(
      'BITNOB_CLIENT_SECRET not in vault'
    );
  });

  it('connects with both halves and an explicit environment', async () => {
    const result = await adapter.connect(
      ctx({ BITNOB_CLIENT_ID: 'c', BITNOB_CLIENT_SECRET: 's' }),
      { environment: 'production' }
    );

    expect(result.accountId).toBe('bitnob');
  });
});

describe('payment-bitnob payout', () => {
  const config = { environment: 'sandbox' as const };

  it('demands the environment first', async () => {
    await expect(adapter.payout!('r', 100, 'NGN', {})).rejects.toThrow(/must be set/);
  });

  it('rejects malformed requests', async () => {
    await expect(adapter.payout!('  ', 100, 'NGN', config)).rejects.toThrow('recipient accountId is required');
    await expect(adapter.payout!('r', 0, 'NGN', config)).rejects.toThrow('positive finite number');
    await expect(adapter.payout!('r', 100, 'NG', config)).rejects.toThrow('3-letter ISO code');
  });

  it('refuses rather than fabricating a transfer id', async () => {
    await expect(adapter.payout!('r', 100, 'NGN', config)).rejects.toThrow('not implemented yet');
  });
});

describe('payment-bitnob checkout', () => {
  it('refuses buyer-facing checkout', async () => {
    await expect(
      adapter.createCheckout({ secret: () => undefined, log: () => {} }, {} as never, {})
    ).rejects.toThrow('does not support buyer-facing checkout');
  });
});
