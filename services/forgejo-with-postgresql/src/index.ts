import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-forgejo-with-postgresql',
  label: "Forgejo With Postgresql",
  category: "vcs",
  description: "Software forge with PostgreSQL",
  coolifyTemplate: "forgejo-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
