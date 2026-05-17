import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-web-check',
  label: "Web Check",
  category: "security",
  description: "Website analysis OSINT tool",
  coolifyTemplate: "web-check",
  homepageUrl: 'https://coolify.io/services',
});
