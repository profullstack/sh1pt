import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-garage',
  label: "Garage",
  category: "storage",
  description: "S3-compatible distributed storage",
  coolifyTemplate: "garage",
  homepageUrl: 'https://coolify.io/services',
});
