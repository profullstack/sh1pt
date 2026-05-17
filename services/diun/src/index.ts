import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-diun',
  label: "Diun",
  category: "monitoring",
  description: "Docker image update notifier",
  coolifyTemplate: "diun",
  homepageUrl: 'https://coolify.io/services',
});
