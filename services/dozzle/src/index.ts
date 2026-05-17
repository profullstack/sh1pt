import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-dozzle',
  label: "Dozzle",
  category: "monitoring",
  description: "Docker logs web interface",
  coolifyTemplate: "dozzle",
  homepageUrl: 'https://coolify.io/services',
});
