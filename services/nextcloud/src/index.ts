import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nextcloud',
  label: "Nextcloud",
  category: "files",
  description: "File storage and collaboration",
  coolifyTemplate: "nextcloud",
  homepageUrl: 'https://coolify.io/services',
});
