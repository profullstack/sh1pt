import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-joplin',
  label: "Joplin",
  category: "productivity",
  description: "Note sync server",
  coolifyTemplate: "joplin",
  homepageUrl: 'https://coolify.io/services',
});
