import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-homarr',
  label: "Homarr",
  category: "dashboard",
  description: "Self-hosted homepage for services",
  coolifyTemplate: "homarr",
  homepageUrl: 'https://coolify.io/services',
});
