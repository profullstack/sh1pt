import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-rocketchat',
  label: "Rocketchat",
  category: "chat",
  description: "Self-hosted communication platform",
  coolifyTemplate: "rocketchat",
  homepageUrl: 'https://coolify.io/services',
});
