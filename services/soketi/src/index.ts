import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-soketi',
  label: "Soketi",
  category: "messaging",
  description: "Open-source WebSockets server",
  coolifyTemplate: "soketi",
  homepageUrl: 'https://coolify.io/services',
});
