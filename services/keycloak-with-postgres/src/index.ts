import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-keycloak-with-postgres',
  label: "Keycloak With Postgres",
  category: "auth",
  description: "IAM with PostgreSQL",
  coolifyTemplate: "keycloak-with-postgres",
  homepageUrl: 'https://coolify.io/services',
});
