import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-weblate',
  label: "Weblate",
  category: "localization",
  description: "Continuous localization platform",
  coolifyTemplate: "weblate",
  homepageUrl: 'https://coolify.io/services',
});
