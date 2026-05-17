import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-heimdall',
  label: "Heimdall",
  category: "dashboard",
  description: "Server application dashboard",
  coolifyTemplate: "heimdall",
  homepageUrl: 'https://coolify.io/services',
});
