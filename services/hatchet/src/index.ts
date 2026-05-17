import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-hatchet',
  label: "Hatchet",
  category: "automation",
  description: "Distributed background task queue",
  coolifyTemplate: "hatchet",
  homepageUrl: 'https://coolify.io/services',
});
