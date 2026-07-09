import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gitea-with-mysql',
  label: "Gitea With Mysql",
  category: "vcs",
  description: "Git service with MySQL",
  coolifyTemplate: "gitea-with-mysql",
  homepageUrl: 'https://coolify.io/services',
});
