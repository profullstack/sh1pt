import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-gitlab',
  label: "Gitlab",
  category: "vcs",
  description: "All-in-one DevOps platform",
  coolifyTemplate: "gitlab",
  homepageUrl: 'https://coolify.io/services',
});
