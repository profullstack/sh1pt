import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-nexus-arm',
  label: "Nexus Arm",
  category: "registry",
  description: "Universal repository manager (ARM)",
  coolifyTemplate: "nexus-arm",
  homepageUrl: 'https://coolify.io/services',
});
