import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-unleash-without-database',
  label: "Unleash Without Database",
  category: "dev",
  description: "Feature flag management",
  coolifyTemplate: "unleash-without-database",
  homepageUrl: 'https://coolify.io/services',
});
