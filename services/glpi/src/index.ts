import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-glpi',
  label: "Glpi",
  category: "helpdesk",
  description: "IT service management platform",
  coolifyTemplate: "glpi",
  homepageUrl: 'https://coolify.io/services',
});
