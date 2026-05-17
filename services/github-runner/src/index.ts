import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-github-runner',
  label: "Github Runner",
  category: "ci",
  description: "GitHub Actions runner",
  coolifyTemplate: "github-runner",
  homepageUrl: 'https://coolify.io/services',
});
