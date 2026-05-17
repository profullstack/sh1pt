import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-wordpress-with-mariadb',
  label: "Wordpress With Mariadb",
  category: "cms",
  description: "CMS with MariaDB",
  coolifyTemplate: "wordpress-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
