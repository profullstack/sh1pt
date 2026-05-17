import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-forgejo-with-mysql',
  label: "Forgejo With Mysql",
  category: "vcs",
  description: "Software forge with MySQL",
  coolifyTemplate: "forgejo-with-mysql",
  homepageUrl: 'https://coolify.io/services',
});
