import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-mailpit',
  label: "Mailpit",
  category: "mail",
  description: "Email and SMTP testing tool",
  coolifyTemplate: "mailpit",
  homepageUrl: 'https://coolify.io/services',
});
