import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-vikunja-with-postgresql',
  label: "Vikunja With Postgresql",
  category: "productivity",
  description: "To-do app with PostgreSQL",
  coolifyTemplate: "vikunja-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
