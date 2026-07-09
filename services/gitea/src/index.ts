import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gitea',
  label: "Gitea",
  category: "vcs",
  description: "Self-hosted Git service",
  coolifyTemplate: "gitea",
  homepageUrl: 'https://coolify.io/services',
});
