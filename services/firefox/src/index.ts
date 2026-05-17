import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-firefox',
  label: "Firefox",
  category: "tools",
  description: "Secure browser for private browsing",
  coolifyTemplate: "firefox",
  homepageUrl: 'https://coolify.io/services',
});
