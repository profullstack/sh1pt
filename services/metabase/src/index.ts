import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-metabase',
  label: "Metabase",
  category: "analytics",
  description: "Analytics with friendly UX",
  coolifyTemplate: "metabase",
  homepageUrl: 'https://coolify.io/services',
});
