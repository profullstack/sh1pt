import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-transmission',
  label: "Transmission",
  category: "files",
  description: "BitTorrent client",
  coolifyTemplate: "transmission",
  homepageUrl: 'https://coolify.io/services',
});
