import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-firefly',
  label: "Firefly",
  category: "finance",
  description: "Personal finances manager",
  coolifyTemplate: "firefly",
  homepageUrl: 'https://coolify.io/services',
});
