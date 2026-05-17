import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-phpmyadmin',
  label: "Phpmyadmin",
  category: "db",
  description: "MySQL database management",
  coolifyTemplate: "phpmyadmin",
  homepageUrl: 'https://coolify.io/services',
});
