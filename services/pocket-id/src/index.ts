import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-pocket-id',
  label: "Pocket Id",
  category: "auth",
  description: "OIDC provider with passkeys",
  coolifyTemplate: "pocket-id",
  homepageUrl: 'https://coolify.io/services',
});
