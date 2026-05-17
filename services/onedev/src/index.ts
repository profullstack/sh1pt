import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-onedev',
  label: "Onedev",
  category: "vcs",
  description: "Git server with CI/CD integration",
  coolifyTemplate: "onedev",
  homepageUrl: 'https://coolify.io/services',
});
