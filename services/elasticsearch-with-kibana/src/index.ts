import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-elasticsearch-with-kibana',
  label: "Elasticsearch With Kibana",
  category: "search",
  description: "Search, monitoring, and visualization",
  coolifyTemplate: "elasticsearch-with-kibana",
  homepageUrl: 'https://coolify.io/services',
});
