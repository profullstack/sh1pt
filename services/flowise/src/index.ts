import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-flowise',
  label: "Flowise",
  category: "ai",
  description: "Low-code LLM orchestration tool",
  coolifyTemplate: "flowise",
  homepageUrl: 'https://coolify.io/services',
});
