import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-calibre-web',
  label: "Calibre Web",
  category: "media",
  description: "eBook library interface",
  coolifyTemplate: "calibre-web",
  homepageUrl: 'https://coolify.io/services',
});
