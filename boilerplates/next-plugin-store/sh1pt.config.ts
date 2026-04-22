import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: 'sh1pt-next-plugin-store',
  version: '0.1.0',
  description: 'Plugin marketplace — publishers list, users buy, sh1pt pays out.',
  // Marketplaces benefit from the same waitlist/investor flow for launch.
  recipe: 'waitlist-crypto-investor',
  recipeConfig: {
    // Override pricing to reflect marketplace dynamics (tiers are platform fees).
    pricing: [
      { id: 'free-tier', label: 'Publisher (Free)', amount: 0, currency: 'USD', cadence: 'monthly', features: ['Unlimited free plugins', '15% platform fee on sales'] },
      { id: 'pro-pub', label: 'Publisher (Pro)', amount: 19, currency: 'USD', cadence: 'monthly', features: ['5% platform fee', 'Analytics', 'Custom branding'] },
    ],
  },
  targets: {
    web: { use: 'web-static', config: { dir: './.next', provider: 'cloudflare-pages' } },
  },
  hooks: {
    prebuild: 'next build',
  },
});
