import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-ntfy',
  label: "Ntfy",
  category: "notifications",
  description: "HTTP-based pub-sub notification service",
  coolifyTemplate: "ntfy",
  homepageUrl: 'https://coolify.io/services',
});
