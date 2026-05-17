import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-immich',
  label: "Immich",
  category: "media",
  description: "Self-hosted photo and video management",
  coolifyTemplate: "immich",
  homepageUrl: 'https://coolify.io/services',
});
