import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-typesense',
  label: "Typesense",
  category: "search",
  description: "In-memory search engine",
  coolifyTemplate: "typesense",
  homepageUrl: 'https://coolify.io/services',
});
