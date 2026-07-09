import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-keycloak',
  label: "Keycloak",
  category: "auth",
  description: "Identity and access management",
  coolifyTemplate: "keycloak",
  homepageUrl: 'https://coolify.io/services',
});
