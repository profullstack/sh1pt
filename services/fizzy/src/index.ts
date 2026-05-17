import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-fizzy',
  label: "Fizzy",
  category: "productivity",
  description: "Kanban tracking by 37signals",
  coolifyTemplate: "fizzy",
  homepageUrl: 'https://coolify.io/services',
});
