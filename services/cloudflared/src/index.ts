import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-cloudflared',
  label: "Cloudflared",
  category: "network",
  description: "Cloudflare Tunnel client",
  coolifyTemplate: "cloudflared",
  homepageUrl: 'https://coolify.io/services',
});
