import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-docuseal',
  label: "Docuseal",
  category: "docs",
  description: "Document signing alternative to DocuSign",
  coolifyTemplate: "docuseal",
  homepageUrl: 'https://coolify.io/services',
});
