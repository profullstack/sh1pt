import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-home-assistant',
  label: "Home Assistant",
  category: "iot",
  description: "Home automation platform",
  coolifyTemplate: "home-assistant",
  homepageUrl: 'https://coolify.io/services',
});
