import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-wings',
  label: "Wings",
  category: "game",
  description: "Pterodactyl server control plane",
  coolifyTemplate: "wings",
  homepageUrl: 'https://coolify.io/services',
});
