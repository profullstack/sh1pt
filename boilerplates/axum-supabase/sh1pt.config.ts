import { defineConfig } from '@profullstack/sh1pt-core';

export default defineConfig({
  name: 'sh1pt-axum-supabase',
  version: '0.1.0',
  description: 'Axum + Supabase backend boilerplate — waitlist + payments + referrals API (Rust)',
  recipe: 'waitlist-crypto-investor',
  recipeConfig: {},
  payments: {
    defaultProvider: 'payment-coinpay',
    providers: {
      coinpay: { use: 'payment-coinpay', enabled: true, config: { acceptedCoins: ['BTC', 'ETH', 'USDC', 'SOL'] } },
      stripe:  { use: 'payment-stripe',  enabled: false, config: {} },
    },
  },
  targets: {
    fly:     { use: 'deploy-fly',     config: { app: 'sh1pt-axum-supabase', strategy: 'rolling' } },
    railway: { enabled: false, use: 'deploy-railway', config: { projectId: 'YOUR_PROJECT', serviceId: 'YOUR_SERVICE' } },
    docker:  { enabled: false, use: 'pkg-docker', config: { image: 'yourorg/sh1pt-axum-supabase', registries: [{ kind: 'ghcr' }], platforms: ['linux/amd64', 'linux/arm64'] } },
  },
  hooks: {
    prebuild: 'cargo build --release',
  },
});
