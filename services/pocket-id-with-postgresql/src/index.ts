import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-pocket-id-with-postgresql',
  label: "Pocket Id With Postgresql",
  category: "auth",
  description: "OIDC provider with PostgreSQL",
  coolifyTemplate: "pocket-id-with-postgresql",
  homepageUrl: 'https://coolify.io/services',
});
