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

  it('ignores payments-shaped examples inside comments', () => {
    const source = `
      export default defineConfig({
        // payments: { providers: { fake: { use: 'payment-fake' } } }
        /*
          payments: {
            defaultProvider: 'payment-commented',
            providers: { commented: { use: 'payment-commented' } },
          },
        */
        name: 'demo',
      });
    `;

    expect(parsePaymentsSummary(source)).toBeUndefined();
  });

  it('does not let a commented example shadow the real payments block', () => {
    const summary = parsePaymentsSummary(`
      export default defineConfig({
        // payments: { providers: { fake: { use: 'payment-fake' } } }
        payments: {
          defaultProvider: 'coinpay',
          providers: {
            coinpay: { use: 'payment-coinpay' },
          },
        },
      });
    `);

    expect(summary?.providers).toEqual([
      { key: 'coinpay', use: 'payment-coinpay', enabled: true, isDefault: true },
    ]);
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

  it('ignores malformed platform fee values instead of partially parsing them', () => {
    const summary = parsePaymentsSummary(`
      export default defineConfig({
        payments: {
          defaultProvider: 'coinpay',
          providers: {
            coinpay: { use: 'payment-coinpay' },
          },
          platformFeeBps: 1500abc,
        },
      });
    `);

    expect(summary?.platformFeeBps).toBeUndefined();
  });

  it('parses providers after a string ending with an escaped backslash', () => {
    const summary = parsePaymentsSummary(`
      export default defineConfig({
        payments: {
          defaultProvider: 'stripe',
          providers: {
            coinpay: {
              use: 'payment-coinpay',
              config: { outputDirectory: 'C:\\\\payments\\\\' },
            },
            stripe: { use: 'payment-stripe' },
          },
        },
      });
    `);

    expect(summary?.providers).toEqual([
      { key: 'coinpay', use: 'payment-coinpay', enabled: true, isDefault: false },
      { key: 'stripe', use: 'payment-stripe', enabled: true, isDefault: true },
    ]);
  });
});
