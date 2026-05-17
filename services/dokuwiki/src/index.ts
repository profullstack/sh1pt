import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-dokuwiki',
  label: "Dokuwiki",
  category: "wiki",
  description: "Lightweight wiki platform",
  coolifyTemplate: "dokuwiki",
  homepageUrl: 'https://coolify.io/services',
});
