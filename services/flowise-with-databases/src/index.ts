import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-flowise-with-databases',
  label: "Flowise With Databases",
  category: "ai",
  description: "LLM tool with Redis and Postgres",
  coolifyTemplate: "flowise-with-databases",
  homepageUrl: 'https://coolify.io/services',
});
