import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gramps-web',
  label: "Gramps Web",
  category: "tracking",
  description: "Online genealogy system",
  coolifyTemplate: "gramps-web",
  homepageUrl: 'https://coolify.io/services',
});
