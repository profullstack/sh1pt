import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-rabbitmq',
  label: "Rabbitmq",
  category: "messaging",
  description: "Open-source message broker",
  coolifyTemplate: "rabbitmq",
  homepageUrl: 'https://coolify.io/services',
});
