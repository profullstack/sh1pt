import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-memos',
  label: "Memos",
  category: "productivity",
  description: "Lightweight note-taking solution",
  coolifyTemplate: "memos",
  homepageUrl: 'https://coolify.io/services',
});
