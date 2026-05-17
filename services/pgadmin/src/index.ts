import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-pgadmin',
  label: "Pgadmin",
  category: "db",
  description: "PostgreSQL database management",
  coolifyTemplate: "pgadmin",
  homepageUrl: 'https://coolify.io/services',
});
