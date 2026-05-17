import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-dozzle-with-auth',
  label: "Dozzle With Auth",
  category: "monitoring",
  description: "Docker logs UI with authentication",
  coolifyTemplate: "dozzle-with-auth",
  homepageUrl: 'https://coolify.io/services',
});
