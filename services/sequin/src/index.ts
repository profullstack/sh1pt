import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-sequin',
  label: "Sequin",
  category: "db",
  description: "PostgreSQL change data capture",
  coolifyTemplate: "sequin",
  homepageUrl: 'https://coolify.io/services',
});
