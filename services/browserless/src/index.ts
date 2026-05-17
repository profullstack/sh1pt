import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-browserless',
  label: "Browserless",
  category: "automation",
  description: "Headless Chrome browser service",
  coolifyTemplate: "browserless",
  homepageUrl: 'https://coolify.io/services',
});
