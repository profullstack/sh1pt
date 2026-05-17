import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-owncloud',
  label: "Owncloud",
  category: "files",
  description: "File management with web UI",
  coolifyTemplate: "owncloud",
  homepageUrl: 'https://coolify.io/services',
});
