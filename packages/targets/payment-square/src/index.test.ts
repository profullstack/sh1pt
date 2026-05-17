import { describe, it, expect } from 'vitest';

describe('payment-square', () => {
  it('should have correct metadata', () => {
    const pkg = require('../package.json');
    expect(pkg.name).toBe('@profullstack/sh1pt-target-payment-square');
  });
});
