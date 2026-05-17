import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-forgejo',
  label: "Forgejo",
  category: "vcs",
  description: "Self-hosted lightweight software forge",
  coolifyTemplate: "forgejo",
  homepageUrl: 'https://coolify.io/services',
});
