import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'sh1pt-next-supabase',
  version: '0.1.0',
  description: 'Next.js + Supabase boilerplate',
  targets: {
    web: {
      use: 'web-static',
      config: {
        dir: './.next',
        provider: 'cloudflare-pages',
      },
    },
    // Uncomment when deploy-vercel / deploy-workers adapters ship.
    // workers: { use: 'deploy-workers', config: { name: 'sh1pt-next-supabase', accountId: 'YOUR_ACCT' } },
    // vercel:  { use: 'deploy-vercel',  config: { project: 'sh1pt-next-supabase' } },
  },
  hooks: {
    prebuild: 'next build',
  },
});
