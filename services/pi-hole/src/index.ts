import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-pi-hole',
  label: "Pi Hole",
  category: "network",
  description: "Network-wide ad blocking",
  coolifyTemplate: "pi-hole",
  homepageUrl: 'https://coolify.io/services',
});
