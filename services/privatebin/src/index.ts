import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-privatebin',
  label: "Privatebin",
  category: "tools",
  description: "Minimalist pastebin service",
  coolifyTemplate: "privatebin",
  homepageUrl: 'https://coolify.io/services',
});
