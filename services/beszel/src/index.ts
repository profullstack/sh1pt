import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-beszel',
  label: "Beszel",
  category: "monitoring",
  description: "Server monitoring hub with historical data",
  coolifyTemplate: "beszel",
  homepageUrl: 'https://coolify.io/services',
});
