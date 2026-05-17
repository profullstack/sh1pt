import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-ghost',
  label: "Ghost",
  category: "cms",
  description: "CMS and blogging platform",
  coolifyTemplate: "ghost",
  homepageUrl: 'https://coolify.io/services',
});
