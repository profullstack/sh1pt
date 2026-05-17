import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-rivet-engine',
  label: "Rivet Engine",
  category: "infra",
  description: "Stateful workload server",
  coolifyTemplate: "rivet-engine",
  homepageUrl: 'https://coolify.io/services',
});
