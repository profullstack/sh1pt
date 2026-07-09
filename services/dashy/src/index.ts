import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-dashy',
  label: "Dashy",
  category: "dashboard",
  description: "Self-hosted personal dashboard",
  coolifyTemplate: "dashy",
  homepageUrl: 'https://coolify.io/services',
});
