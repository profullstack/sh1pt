import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-prefect',
  label: "Prefect",
  category: "automation",
  description: "Workflow orchestration platform",
  coolifyTemplate: "prefect",
  homepageUrl: 'https://coolify.io/services',
});
