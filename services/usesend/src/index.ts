import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-usesend',
  label: "Usesend",
  category: "mail",
  description: "Email service alternative",
  coolifyTemplate: "usesend",
  homepageUrl: 'https://coolify.io/services',
});
