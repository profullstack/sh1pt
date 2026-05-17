import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-mosquitto',
  label: "Mosquitto",
  category: "messaging",
  description: "Lightweight MQTT message broker",
  coolifyTemplate: "mosquitto",
  homepageUrl: 'https://coolify.io/services',
});
