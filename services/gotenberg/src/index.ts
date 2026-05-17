import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gotenberg',
  label: "Gotenberg",
  category: "tools",
  description: "Docker-powered PDF API",
  coolifyTemplate: "gotenberg",
  homepageUrl: 'https://coolify.io/services',
});
