import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-duplicati',
  label: "Duplicati",
  category: "backup",
  description: "Scheduled backup solution",
  coolifyTemplate: "duplicati",
  homepageUrl: 'https://coolify.io/services',
});
