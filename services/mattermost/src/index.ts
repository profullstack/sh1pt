import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-mattermost',
  label: "Mattermost",
  category: "chat",
  description: "Self-hosted Slack alternative",
  coolifyTemplate: "mattermost",
  homepageUrl: 'https://coolify.io/services',
});
