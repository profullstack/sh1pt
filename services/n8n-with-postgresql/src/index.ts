import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-n8n-with-postgresql',
  label: "N8n With Postgresql",
  category: "automation",
  description: "Workflow automation with PostgreSQL",
  coolifyTemplate: "n8n-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
