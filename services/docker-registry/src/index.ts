import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-docker-registry',
  label: "Docker Registry",
  category: "registry",
  description: "Docker image distribution",
  coolifyTemplate: "docker-registry",
  homepageUrl: 'https://coolify.io/services',
});
