import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-changedetection',
  label: "Changedetection",
  category: "monitoring",
  description: "Website change monitoring",
  coolifyTemplate: "changedetection",
  homepageUrl: 'https://coolify.io/services',
});
