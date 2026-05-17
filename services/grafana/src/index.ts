import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-grafana',
  label: "Grafana",
  category: "monitoring",
  description: "Analytics and monitoring solution",
  coolifyTemplate: "grafana",
  homepageUrl: 'https://coolify.io/services',
});
