import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'boilerplates/**', 'sites/**'],
    passWithNoTests: true,
    // Contract tests never touch the network; nothing should take > 5s.
    testTimeout: 5000,
    globals: false,
  },
});
