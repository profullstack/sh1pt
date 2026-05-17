import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-litellm',
  label: "Litellm",
  category: "ai",
  description: "LLM API gateway supporting 100+ models",
  coolifyTemplate: "litellm",
  homepageUrl: 'https://coolify.io/services',
});
