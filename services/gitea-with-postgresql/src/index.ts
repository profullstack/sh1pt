import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gitea-with-postgresql',
  label: "Gitea With Postgresql",
  category: "vcs",
  description: "Git service with PostgreSQL",
  coolifyTemplate: "gitea-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
