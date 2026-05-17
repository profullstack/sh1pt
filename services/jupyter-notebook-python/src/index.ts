import { defineService } from '@profullstack/sh1pt-core';

export default defineService({
  id: 'service-jupyter-notebook-python',
  label: "Jupyter Notebook Python",
  category: "ide",
  description: "Interactive notebook application",
  coolifyTemplate: "jupyter-notebook-python",
  homepageUrl: 'https://coolify.io/services',
});
