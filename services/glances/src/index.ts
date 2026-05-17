import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-glances',
  label: "Glances",
  category: "monitoring",
  description: "System resource monitoring",
  coolifyTemplate: "glances",
  homepageUrl: 'https://coolify.io/services',
});
