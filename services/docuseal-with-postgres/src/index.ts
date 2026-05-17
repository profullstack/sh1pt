import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-docuseal-with-postgres',
  label: "Docuseal With Postgres",
  category: "docs",
  description: "Document signing with PostgreSQL",
  coolifyTemplate: "docuseal-with-postgres",
  homepageUrl: 'https://coolify.io/services',
});
