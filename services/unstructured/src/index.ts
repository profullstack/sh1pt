import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-unstructured',
  label: "Unstructured",
  category: "ai",
  description: "Document processing for RAG",
  coolifyTemplate: "unstructured",
  homepageUrl: 'https://coolify.io/services',
});
