import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-signoz',
  label: "Signoz",
  category: "observability",
  description: "OpenTelemetry observability platform",
  coolifyTemplate: "signoz",
  homepageUrl: 'https://coolify.io/services',
});
