import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-whoogle',
  label: "Whoogle",
  category: "search",
  description: "Privacy-focused Google search",
  coolifyTemplate: "whoogle",
  homepageUrl: 'https://coolify.io/services',
});
