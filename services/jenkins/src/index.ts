import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-jenkins',
  label: "Jenkins",
  category: "ci",
  description: "Automation server for CI/CD",
  coolifyTemplate: "jenkins",
  homepageUrl: 'https://coolify.io/services',
});
