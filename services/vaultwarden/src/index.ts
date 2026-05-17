import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-vaultwarden',
  label: "Vaultwarden",
  category: "security",
  description: "Self-hosted password manager",
  coolifyTemplate: "vaultwarden",
  homepageUrl: 'https://coolify.io/services',
});
