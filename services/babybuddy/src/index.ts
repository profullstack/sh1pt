import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-babybuddy',
  label: "Babybuddy",
  category: "tracking",
  description: "Baby activity and health tracking",
  coolifyTemplate: "babybuddy",
  homepageUrl: 'https://coolify.io/services',
});
