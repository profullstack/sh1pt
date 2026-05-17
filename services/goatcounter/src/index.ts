import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-goatcounter',
  label: "Goatcounter",
  category: "analytics",
  description: "Lightweight web analytics",
  coolifyTemplate: "goatcounter",
  homepageUrl: 'https://coolify.io/services',
});
