import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-minecraft',
  label: "Minecraft",
  category: "game",
  description: "Game server with auto-update",
  coolifyTemplate: "minecraft",
  homepageUrl: 'https://coolify.io/services',
});
