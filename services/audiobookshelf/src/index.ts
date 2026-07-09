import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-audiobookshelf',
  label: "Audiobookshelf",
  category: "media",
  description: "Self-hosted audiobook and podcast server",
  coolifyTemplate: "audiobookshelf",
  homepageUrl: 'https://coolify.io/services',
});
