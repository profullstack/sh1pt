import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-cap-captcha',
  label: "Cap Captcha",
  category: "security",
  description: "Self-hosted CAPTCHA solution",
  coolifyTemplate: "cap-captcha",
  homepageUrl: 'https://coolify.io/services',
});
