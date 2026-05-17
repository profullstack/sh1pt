import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-umami',
  label: "Umami",
  category: "analytics",
  description: "Privacy-focused web analytics",
  coolifyTemplate: "umami",
  homepageUrl: 'https://coolify.io/services',
});
