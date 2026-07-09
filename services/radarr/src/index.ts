import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-radarr',
  label: "Radarr",
  category: "media",
  description: "Movie management similar to Sonarr",
  coolifyTemplate: "radarr",
  homepageUrl: 'https://coolify.io/services',
});
