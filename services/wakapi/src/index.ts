import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-wakapi',
  label: "Wakapi",
  category: "tracking",
  description: "WakaTime-compatible analytics",
  coolifyTemplate: "wakapi",
  homepageUrl: 'https://coolify.io/services',
});
