import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-libretranslate',
  label: "Libretranslate",
  category: "localization",
  description: "Self-hosted machine translation API",
  coolifyTemplate: "libretranslate",
  homepageUrl: 'https://coolify.io/services',
});
