import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-electricsql',
  label: "Electricsql",
  category: "db",
  description: "PostgreSQL data sync over HTTP",
  coolifyTemplate: "electricsql",
  homepageUrl: 'https://coolify.io/services',
});
