import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-onetimesecret',
  label: "Onetimesecret",
  category: "security",
  description: "Self-destructing secret sharing",
  coolifyTemplate: "onetimesecret",
  homepageUrl: 'https://coolify.io/services',
});
