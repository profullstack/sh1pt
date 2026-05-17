import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-classicpress-with-mariadb',
  label: "Classicpress With Mariadb",
  category: "cms",
  description: "WordPress alternative without Gutenberg",
  coolifyTemplate: "classicpress-with-mariadb",
  homepageUrl: 'https://coolify.io/services',
});
