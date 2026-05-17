import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-uptime-kuma-with-mariadb',
  label: "Uptime Kuma With Mariadb",
  category: "monitoring",
  description: "Monitoring with MariaDB",
  coolifyTemplate: "uptime-kuma-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
