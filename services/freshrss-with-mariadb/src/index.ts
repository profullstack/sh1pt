import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-freshrss-with-mariadb',
  label: "Freshrss With Mariadb",
  category: "productivity",
  description: "Feed aggregator with MariaDB",
  coolifyTemplate: "freshrss-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
