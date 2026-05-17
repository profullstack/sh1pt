import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-glitchtip',
  label: "Glitchtip",
  category: "observability",
  description: "Error tracking system",
  coolifyTemplate: "glitchtip",
  homepageUrl: 'https://coolify.io/services',
});
