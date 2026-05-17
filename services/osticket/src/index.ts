import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-osticket',
  label: "Osticket",
  category: "helpdesk",
  description: "Open-source support ticket system",
  coolifyTemplate: "osticket",
  homepageUrl: 'https://coolify.io/services',
});
