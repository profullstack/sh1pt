import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-passbolt',
  label: "Passbolt",
  category: "security",
  description: "Open-source password manager",
  coolifyTemplate: "passbolt",
  homepageUrl: 'https://coolify.io/services',
});
