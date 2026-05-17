import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-code-server',
  label: "Code Server",
  category: "ide",
  description: "Web-based code editor",
  coolifyTemplate: "code-server",
  homepageUrl: 'https://coolify.io/services',
});
