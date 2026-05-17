import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-seaweedfs',
  label: "Seaweedfs",
  category: "storage",
  description: "Distributed file system with S3",
  coolifyTemplate: "seaweedfs",
  homepageUrl: 'https://coolify.io/services',
});
