import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-bugsink',
  label: "Bugsink",
  category: "observability",
  description: "Self-hosted error tracking",
  coolifyTemplate: "bugsink",
  homepageUrl: 'https://coolify.io/services',
});
