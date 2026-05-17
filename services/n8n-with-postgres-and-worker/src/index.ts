import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-n8n-with-postgres-and-worker',
  label: "N8n With Postgres And Worker",
  category: "automation",
  description: "Automation with queue mode",
  coolifyTemplate: "n8n-with-postgres-and-worker",
  homepageUrl: 'https://coolify.io/services',
});
