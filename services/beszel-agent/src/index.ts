import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-beszel-agent',
  label: "Beszel Agent",
  category: "monitoring",
  description: "Monitoring agent for Beszel",
  coolifyTemplate: "beszel-agent",
  homepageUrl: 'https://coolify.io/services',
});
