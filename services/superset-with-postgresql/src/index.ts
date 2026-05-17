import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-superset-with-postgresql',
  label: "Superset With Postgresql",
  category: "analytics",
  description: "Data exploration and visualization",
  coolifyTemplate: "superset-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
