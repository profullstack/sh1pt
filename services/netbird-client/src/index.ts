import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-netbird-client',
  label: "Netbird Client",
  category: "network",
  description: "WireGuard overlay network client",
  coolifyTemplate: "netbird-client",
  homepageUrl: 'https://coolify.io/services',
});
