import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-actualbudget',
  label: "Actualbudget",
  category: "finance",
  description: "A local-first personal finance app",
  coolifyTemplate: "actualbudget",
  homepageUrl: 'https://coolify.io/services',
});
