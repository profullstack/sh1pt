import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-soketi-app-manager',
  label: "Soketi App Manager",
  category: "messaging",
  description: "Websocket server management",
  coolifyTemplate: "soketi-app-manager",
  homepageUrl: 'https://coolify.io/services',
});
