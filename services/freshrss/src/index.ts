import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-freshrss',
  label: "Freshrss",
  category: "productivity",
  description: "Self-hostable feed aggregator",
  coolifyTemplate: "freshrss",
  homepageUrl: 'https://coolify.io/services',
});
