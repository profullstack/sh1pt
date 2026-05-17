import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-traccar',
  label: "Traccar",
  category: "tracking",
  description: "GPS tracking system",
  coolifyTemplate: "traccar",
  homepageUrl: 'https://coolify.io/services',
});
