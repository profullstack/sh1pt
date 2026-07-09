import { describe, expect, it } from 'vitest';
import { parsePaymentsSummary } from './config-payments.js';

describe('parsePaymentsSummary', () => {
  it('extracts configured providers, default, and platform fee from sh1pt config text', () => {
    const summary = parsePaymentsSummary(`
      import { defineConfig } from '@profullstack/sh1pt-core';

      export default defineConfig({
        name: 'demo',
        payments: {
          defaultProvider: 'payment-coinpay',
          providers: {
            coinpay: { use: 'payment-coinpay', enabled: true, config: { acceptedCoins: ['BTC', 'USDC'] } },
            stripe:  { use: 'payment-stripe',  enabled: false, config: {} },
            'paypal-business': { use: 'payment-paypal', config: {} },
          },
          platformFeeBps: 1500,
        },
      });
    `);

    expect(summary).toEqual({
      path: 'sh1pt.config.ts',
      defaultProvider: 'payment-coinpay',
      platformFeeBps: 1500,
      providers: [
        { key: 'coinpay', use: 'payment-coinpay', enabled: true, isDefault: true },
        { key: 'stripe', use: 'payment-stripe', enabled: false, isDefault: false },
        { key: 'paypal-business', use: 'payment-paypal', enabled: true, isDefault: false },
      ],
    });
  });

  it('returns undefined when no payments block exists', () => {
    expect(parsePaymentsSummary('export default defineConfig({ name: "demo" })')).toBeUndefined();
  });

  it('extracts payments when config object keys are quoted', () => {
    const summary = parsePaymentsSummary(`
      export default defineConfig({
        "payments": {
          "defaultProvider": "coinpay",
          "providers": {
            "coinpay": { "use": "payment-coinpay", "enabled": true },
          },
          "platformFeeBps": 250,
        },
      });
    `);

    expect(summary).toEqual({
      path: 'sh1pt.config.ts',
      defaultProvider: 'coinpay',
      platformFeeBps: 250,
      providers: [
        { key: 'coinpay', use: 'payment-coinpay', enabled: true, isDefault: true },
      ],
    });
  });
});
