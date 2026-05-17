import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nextcloud-with-mariadb',
  label: "Nextcloud With Mariadb",
  category: "files",
  description: "File storage with MariaDB",
  coolifyTemplate: "nextcloud-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
