import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-authentik',
  label: "Authentik",
  category: "auth",
  description: "Open-source identity provider",
  coolifyTemplate: "authentik",
  homepageUrl: 'https://coolify.io/services',
});
