import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-databasus',
  label: "Databasus",
  category: "backup",
  description: "PostgreSQL, MySQL, MongoDB backup tool",
  coolifyTemplate: "databasus",
  homepageUrl: 'https://coolify.io/services',
});
