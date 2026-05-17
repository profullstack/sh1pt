import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-marimo',
  label: "Marimo",
  category: "ide",
  description: "Reactive Python notebook",
  coolifyTemplate: "marimo",
  homepageUrl: 'https://coolify.io/services',
});
