import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-soju',
  label: "Soju",
  category: "chat",
  description: "IRC bouncer with web interface",
  coolifyTemplate: "soju",
  homepageUrl: 'https://coolify.io/services',
});
