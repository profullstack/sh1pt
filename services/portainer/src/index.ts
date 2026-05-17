import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-portainer',
  label: "Portainer",
  category: "infra",
  description: "Docker management UI",
  coolifyTemplate: "portainer",
  homepageUrl: 'https://coolify.io/services',
});
