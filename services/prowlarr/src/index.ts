import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-prowlarr',
  label: "Prowlarr",
  category: "media",
  description: "Indexer manager and proxy",
  coolifyTemplate: "prowlarr",
  homepageUrl: 'https://coolify.io/services',
});
