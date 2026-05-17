import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-ente-photos-with-s3',
  label: "Ente Photos With S3",
  category: "media",
  description: "Photo storage with S3 backend",
  coolifyTemplate: "ente-photos-with-s3",
  homepageUrl: 'https://coolify.io/services',
});
