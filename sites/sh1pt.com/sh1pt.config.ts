import { defineConfig } from '@sh1pt/core';

// sh1pt.com — sh1pt's own marketing + waitlist + investor site.
// Uses the waitlist-crypto-investor recipe (dogfooding) and ships to
// Cloudflare Pages with the real domain attached.
export default defineConfig({
  name: 'sh1pt-dot-com',
  version: '0.1.0',
  description: 'sh1pt.com — marketing site + prepaid waitlist + investor page',
  recipe: 'waitlist-crypto-investor',
  recipeConfig: {}, // accept the recipe defaults ($244 early-bird / $499 standard, etc.)
  payments: {
    defaultProvider: 'payment-coinpay',
    providers: {
      coinpay: { use: 'payment-coinpay', enabled: true, config: { acceptedCoins: ['BTC', 'ETH', 'USDC', 'SOL'] } },
      stripe:  { use: 'payment-stripe',  enabled: true, config: {} },
    },
  },
  targets: {
    web: {
      use: 'web-static',
      config: {
        dir: './.next',
        provider: 'cloudflare-pages',
        project: 'sh1pt-dot-com',
        domain: 'sh1pt.dev',
      },
    },
  },
  hooks: {
    prebuild: 'next build',
  },
  cloud: {
    org: 'profullstack',
    project: 'sh1pt-dot-com',
  },
});
