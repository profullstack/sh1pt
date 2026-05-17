import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gitea-with-mariadb',
  label: "Gitea With Mariadb",
  category: "vcs",
  description: "Git service with MariaDB",
  coolifyTemplate: "gitea-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
