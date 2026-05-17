import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-trailbase',
  label: "Trailbase",
  category: "backend",
  description: "Rust/SQLite app server",
  coolifyTemplate: "trailbase",
  homepageUrl: 'https://coolify.io/services',
});
