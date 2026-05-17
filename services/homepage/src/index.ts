import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-homepage',
  label: "Homepage",
  category: "dashboard",
  description: "Static application dashboard",
  coolifyTemplate: "homepage",
  homepageUrl: 'https://coolify.io/services',
});
