import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-uptime-kuma',
  label: "Uptime Kuma",
  category: "monitoring",
  description: "Monitoring and status tracking",
  coolifyTemplate: "uptime-kuma",
  homepageUrl: 'https://coolify.io/services',
});
