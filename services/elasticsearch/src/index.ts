import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-elasticsearch',
  label: "Elasticsearch",
  category: "search",
  description: "Distributed search engine",
  coolifyTemplate: "elasticsearch",
  homepageUrl: 'https://coolify.io/services',
});
