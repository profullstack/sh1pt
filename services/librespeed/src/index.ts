import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-librespeed',
  label: "Librespeed",
  category: "tools",
  description: "Self-hosted speed test",
  coolifyTemplate: "librespeed",
  homepageUrl: 'https://coolify.io/services',
});
