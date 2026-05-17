import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-emby',
  label: "Emby",
  category: "media",
  description: "Media server for content streaming",
  coolifyTemplate: "emby",
  homepageUrl: 'https://coolify.io/services',
});
