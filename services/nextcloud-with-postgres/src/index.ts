import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nextcloud-with-postgres',
  label: "Nextcloud With Postgres",
  category: "files",
  description: "File storage with PostgreSQL",
  coolifyTemplate: "nextcloud-with-postgres",
  homepageUrl: 'https://coolify.io/services',
});
