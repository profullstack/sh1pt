import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-shlink',
  label: "Shlink",
  category: "urlshortener",
  description: "Self-hosted URL shortener",
  coolifyTemplate: "shlink",
  homepageUrl: 'https://coolify.io/services',
});
