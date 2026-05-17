import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-uptime-kuma-with-mysql',
  label: "Uptime Kuma With Mysql",
  category: "monitoring",
  description: "Monitoring with MySQL",
  coolifyTemplate: "uptime-kuma-with-mysql",
  homepageUrl: 'https://coolify.io/services',
});
