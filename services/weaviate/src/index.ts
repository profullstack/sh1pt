import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-weaviate',
  label: "Weaviate",
  category: "ai",
  description: "Vector database with filtering",
  coolifyTemplate: "weaviate",
  homepageUrl: 'https://coolify.io/services',
});
