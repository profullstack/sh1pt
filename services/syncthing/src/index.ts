import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-syncthing',
  label: "Syncthing",
  category: "files",
  description: "Real-time file synchronization",
  coolifyTemplate: "syncthing",
  homepageUrl: 'https://coolify.io/services',
});
