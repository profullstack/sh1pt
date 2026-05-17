import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-jitsi',
  label: "Jitsi",
  category: "video",
  description: "Self-hosted video conferencing",
  coolifyTemplate: "jitsi",
  homepageUrl: 'https://coolify.io/services',
});
