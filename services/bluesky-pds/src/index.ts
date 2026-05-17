import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-bluesky-pds',
  label: "Bluesky Pds",
  category: "social",
  description: "Personal data server",
  coolifyTemplate: "bluesky-pds",
  homepageUrl: 'https://coolify.io/services',
});
