import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-miniflux',
  label: "Miniflux",
  category: "productivity",
  description: "Minimalist feed reader",
  coolifyTemplate: "miniflux",
  homepageUrl: 'https://coolify.io/services',
});
