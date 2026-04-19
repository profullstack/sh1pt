import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'sh1pt-bun-hono-supabase',
  version: '0.1.0',
  description: 'Bun + Hono + Supabase backend boilerplate',
  targets: {
    fly: {
      use: 'deploy-fly',
      config: { app: 'sh1pt-bun-hono-supabase', strategy: 'rolling' },
    },
    railway: {
      enabled: false,
      use: 'deploy-railway',
      config: { projectId: 'YOUR_PROJECT', serviceId: 'YOUR_SERVICE' },
    },
    docker: {
      enabled: false,
      use: 'pkg-docker',
      config: {
        image: 'yourorg/sh1pt-bun-hono-supabase',
        registries: [{ kind: 'ghcr' }, { kind: 'dockerhub' }],
        platforms: ['linux/amd64', 'linux/arm64'],
      },
    },
  },
  hooks: {
    // bun produces a single-file executable — great for Docker/Fly cold-start
    prebuild: 'bun build src/index.ts --compile --outfile dist/server',
  },
});
