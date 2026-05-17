import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-mealie',
  label: "Mealie",
  category: "productivity",
  description: "Recipe manager and meal planner",
  coolifyTemplate: "mealie",
  homepageUrl: 'https://coolify.io/services',
});
