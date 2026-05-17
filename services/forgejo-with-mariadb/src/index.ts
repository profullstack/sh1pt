import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-forgejo-with-mariadb',
  label: "Forgejo With Mariadb",
  category: "vcs",
  description: "Software forge with MariaDB",
  coolifyTemplate: "forgejo-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
