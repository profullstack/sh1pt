import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-checkmate',
  label: "Checkmate",
  category: "monitoring",
  description: "Server and website monitoring application",
  coolifyTemplate: "checkmate",
  homepageUrl: 'https://coolify.io/services',
});
