import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-tailscale-client',
  label: "Tailscale Client",
  category: "network",
  description: "WireGuard VPN service",
  coolifyTemplate: "tailscale-client",
  homepageUrl: 'https://coolify.io/services',
});
