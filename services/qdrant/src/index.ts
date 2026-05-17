import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-qdrant',
  label: "Qdrant",
  category: "ai",
  description: "Vector similarity search engine",
  coolifyTemplate: "qdrant",
  homepageUrl: 'https://coolify.io/services',
});
