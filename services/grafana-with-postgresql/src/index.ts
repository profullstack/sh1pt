import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-grafana-with-postgresql',
  label: "Grafana With Postgresql",
  category: "monitoring",
  description: "Analytics with PostgreSQL",
  coolifyTemplate: "grafana-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
