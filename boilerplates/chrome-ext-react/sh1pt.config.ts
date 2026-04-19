import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'sh1pt-chrome-ext-react',
  version: '0.1.0',
  recipe: 'waitlist-crypto-investor',
  recipeConfig: {},
  targets: {
    chrome: {
      use: 'browser-chrome',
      config: {
        extensionId: 'YOUR_EXTENSION_ID',
        sourceDir: './dist',
      },
    },
    // Uncomment when these adapters ship:
    // firefox: { use: 'browser-firefox', config: { addonId: 'YOUR_ADDON_ID', sourceDir: './dist' } },
    // edge:    { use: 'browser-edge',    config: { productId: 'YOUR_PRODUCT_ID', sourceDir: './dist' } },
  },
  hooks: {
    prebuild: 'npm run build',
  },
});
