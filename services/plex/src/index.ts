import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-plex',
  label: "Plex",
  category: "media",
  description: "Media organization and streaming",
  coolifyTemplate: "plex",
  homepageUrl: 'https://coolify.io/services',
});
