import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-glance',
  label: "Glance",
  category: "dashboard",
  description: "Self-hosted dashboard for feeds",
  coolifyTemplate: "glance",
  homepageUrl: 'https://coolify.io/services',
});
