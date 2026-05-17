import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-redis-insight',
  label: "Redis Insight",
  category: "db",
  description: "Redis GUI client",
  coolifyTemplate: "redis-insight",
  homepageUrl: 'https://coolify.io/services',
});
