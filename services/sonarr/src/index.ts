import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-sonarr',
  label: "Sonarr",
  category: "media",
  description: "TV show management and automation",
  coolifyTemplate: "sonarr",
  homepageUrl: 'https://coolify.io/services',
});
