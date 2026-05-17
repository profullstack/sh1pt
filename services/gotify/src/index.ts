import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gotify',
  label: "Gotify",
  category: "notifications",
  description: "Self-hosted notification server",
  coolifyTemplate: "gotify",
  homepageUrl: 'https://coolify.io/services',
});
