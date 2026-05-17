import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-autobase',
  label: "Autobase",
  category: "db",
  description: "Self-hosted PostgreSQL database alternative",
  coolifyTemplate: "autobase",
  homepageUrl: 'https://coolify.io/services',
});
