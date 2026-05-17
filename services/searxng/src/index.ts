import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-searxng',
  label: "Searxng",
  category: "search",
  description: "Metasearch engine aggregating 70+ services",
  coolifyTemplate: "searxng",
  homepageUrl: 'https://coolify.io/services',
});
