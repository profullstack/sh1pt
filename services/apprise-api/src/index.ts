import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-apprise-api',
  label: "Apprise Api",
  category: "notifications",
  description: "Push notifications API",
  coolifyTemplate: "apprise-api",
  homepageUrl: 'https://coolify.io/services',
});
