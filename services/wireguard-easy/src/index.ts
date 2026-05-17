import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-wireguard-easy',
  label: "Wireguard Easy",
  category: "network",
  description: "WireGuard VPN with web admin",
  coolifyTemplate: "wireguard-easy",
  homepageUrl: 'https://coolify.io/services',
});
