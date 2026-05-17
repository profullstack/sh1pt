import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-jellyfin',
  label: "Jellyfin",
  category: "media",
  description: "Media server for content streaming",
  coolifyTemplate: "jellyfin",
  homepageUrl: 'https://coolify.io/services',
});
