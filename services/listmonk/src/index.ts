import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-listmonk',
  label: "Listmonk",
  category: "mail",
  description: "Self-hosted newsletter and mailing list",
  coolifyTemplate: "listmonk",
  homepageUrl: 'https://coolify.io/services',
});
