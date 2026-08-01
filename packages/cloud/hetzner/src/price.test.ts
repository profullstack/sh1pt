import { describe, expect, it } from 'vitest';
import { parseHetznerPrice } from './index.js';

describe('parseHetznerPrice', () => {
  it('accepts decimal API prices', () => {
    expect(parseHetznerPrice('0.005')).toBe(0.005);
    expect(parseHetznerPrice(' 12.50 ')).toBe(12.5);
  });

  it('rejects malformed and non-decimal API prices instead of partially parsing them', () => {
    for (const value of ['12.50 EUR', '1e-3', 'Infinity', '-1', '']) {
      expect(parseHetznerPrice(value)).toBe(0);
    }
  });
});
