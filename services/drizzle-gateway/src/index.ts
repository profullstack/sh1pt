import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-drizzle-gateway',
  label: "Drizzle Gateway",
  category: "db",
  description: "Drizzle Studio alternative",
  coolifyTemplate: "drizzle-gateway",
  homepageUrl: 'https://coolify.io/services',
});
