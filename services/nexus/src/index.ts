import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nexus',
  label: "Nexus",
  category: "registry",
  description: "Universal repository manager (x86_64)",
  coolifyTemplate: "nexus",
  homepageUrl: 'https://coolify.io/services',
});
