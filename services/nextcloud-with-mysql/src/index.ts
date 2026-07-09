import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nextcloud-with-mysql',
  label: "Nextcloud With Mysql",
  category: "files",
  description: "File storage with MySQL",
  coolifyTemplate: "nextcloud-with-mysql",
  homepageUrl: 'https://coolify.io/services',
});
