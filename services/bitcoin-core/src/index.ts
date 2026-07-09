import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-bitcoin-core',
  label: "Bitcoin Core",
  category: "crypto",
  description: "Self-hosted Bitcoin full node",
  coolifyTemplate: "bitcoin-core",
  homepageUrl: 'https://coolify.io/services',
});
