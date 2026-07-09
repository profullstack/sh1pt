import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-pgbackweb',
  label: "Pgbackweb",
  category: "backup",
  description: "PostgreSQL backup web interface",
  coolifyTemplate: "pgbackweb",
  homepageUrl: 'https://coolify.io/services',
});
