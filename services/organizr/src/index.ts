import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-organizr',
  label: "Organizr",
  category: "dashboard",
  description: "Homelab services organizer",
  coolifyTemplate: "organizr",
  homepageUrl: 'https://coolify.io/services',
});
