import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter from './index.js';

// worldremit is a payouts adapter, not a checkout provider — supports[] is
// intentionally empty (the interface's supports field enumerates buyer-side
// currencies/methods). requireSupports skipped.
smokeTest(adapter, { idPrefix: 'payment', requireSupports: false });

describe('payment-worldremit payout validation', () => {
  it('rejects missing payout recipients before returning a transfer id', async () => {
    await expect(adapter.payout!('   ', 1000, 'USD', {})).rejects.toThrow('recipient accountId is required');
  });

  it('rejects invalid payout amounts before returning a transfer id', async () => {
    await expect(adapter.payout!('recipient-1', 0, 'USD', {})).rejects.toThrow('positive finite number');
    await expect(adapter.payout!('recipient-1', Number.NaN, 'USD', {})).rejects.toThrow('positive finite number');
  });

  it('rejects malformed payout currencies before returning a transfer id', async () => {
    await expect(adapter.payout!('recipient-1', 1000, 'US', {})).rejects.toThrow('3-letter ISO code');
  });
});
