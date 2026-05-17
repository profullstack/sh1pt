import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-wordpress-without-database',
  label: "Wordpress Without Database",
  category: "cms",
  description: "CMS variant",
  coolifyTemplate: "wordpress-without-database",
  homepageUrl: 'https://coolify.io/services',
});
