import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-classicpress-without-database',
  label: "Classicpress Without Database",
  category: "cms",
  description: "WordPress alternative without Gutenberg",
  coolifyTemplate: "classicpress-without-database",
  homepageUrl: 'https://coolify.io/services',
});
