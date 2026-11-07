import { describe, expect, it } from 'vitest';
import { passFromUserinfo } from '@profullstack/coinpay-onboard/pass';
import { passUntilToStore, recordCoinpayPass, type PassStore } from './coinpay-pass';
import { planStatus } from './plan';

const NOW = Date.parse('2026-11-07T00:00:00Z');
const FUTURE = '2026-12-07T00:00:00.000Z';
const claim = (pass: unknown) => passFromUserinfo({ pass }, new Date(NOW));

function memStore(initial: string | null = null): PassStore & { writes: string[] } {
  let v = initial;
  const writes: string[] = [];
  return {
    writes,
    async get() { return v; },
    async set(_u, until) { v = until; writes.push(until); },
  };
}

describe('coinpay pass', () => {
  it('stores only an active pass that ends in the future', () => {
    expect(passUntilToStore(claim({ active: true, expires_at: FUTURE }), NOW)).toBe(FUTURE);
    expect(passUntilToStore(claim({ active: false, expires_at: FUTURE }), NOW)).toBeNull();
    expect(passUntilToStore(claim({ active: true, expires_at: 'garbage' }), NOW)).toBeNull();
    expect(passUntilToStore(claim({ active: true, expires_at: '2026-01-01T00:00:00Z' }), NOW)).toBeNull();
    expect(passUntilToStore(null, NOW)).toBeNull();
  });

  it('records once and never shortens a later pass', async () => {
    const s = memStore();
    expect(await recordCoinpayPass(s, 'u', claim({ active: true, expires_at: FUTURE }), NOW)).toBe(FUTURE);
    expect(await recordCoinpayPass(s, 'u', claim({ active: true, expires_at: FUTURE }), NOW)).toBeNull();
    expect(await recordCoinpayPass(s, 'u', claim({ active: true, expires_at: '2026-11-20T00:00:00Z' }), NOW)).toBeNull();
    expect(s.writes).toEqual([FUTURE]);
  });

  it('a pass makes the account Pro until it ends, the paid term wins when later', () => {
    expect(planStatus({ coinpay_pass_until: FUTURE }, NOW)).toMatchObject({ pro: true, proUntil: FUTURE, daysLeft: 30 });
    expect(planStatus({ coinpay_pass_until: FUTURE }, Date.parse(FUTURE) + 1)).toMatchObject({ pro: false, daysLeft: 0 });
    expect(planStatus({ pro_until: '2027-01-06T00:00:00.000Z', coinpay_pass_until: FUTURE }, NOW)).toMatchObject({
      pro: true,
      proUntil: '2027-01-06T00:00:00.000Z',
      daysLeft: 60,
    });
  });
});
