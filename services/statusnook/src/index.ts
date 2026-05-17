import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-statusnook',
  label: "Statusnook",
  category: "monitoring",
  description: "Status page and endpoint monitoring",
  coolifyTemplate: "statusnook",
  homepageUrl: 'https://coolify.io/services',
});
