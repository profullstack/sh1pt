import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-yamtrack-with-postgresql',
  label: "Yamtrack With Postgresql",
  category: "tracking",
  description: "Media tracker with PostgreSQL",
  coolifyTemplate: "yamtrack-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
