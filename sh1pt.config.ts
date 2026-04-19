import { defineConfig } from '@sh1pt/core';

// sh1pt uses sh1pt to publish itself.
//
// This repo builds and ships exactly one artifact: the `sh1pt` CLI
// (packages/cli). That one CLI fans out to every package manager so
// users can install it however they install anything else:
//
//   npm install -g @sh1pt/cli
//   brew install sh1pt
//   winget install sh1pt
//   scoop install sh1pt
//   snap install sh1pt
//   apt install sh1pt          (once we host the repo)
//
// Everything else in this repo (api, web, sdk, target adapters, policy
// linter) is either runtime cloud infrastructure or library code that
// ships via `pkg-npm` alongside the CLI.

export default defineConfig({
  name: 'sh1pt',
  version: '0.0.0',
  description: 'Ship one codebase to every platform, store, and registry.',
  channels: ['stable', 'beta', 'canary'],
  cloud: {
    org: 'profullstack',
    project: 'sh1pt',
  },
  targets: {
    'cli-npm': {
      use: 'pkg-npm',
      config: {
        packageDir: './packages/cli',
        access: 'public',
      },
    },
    'cli-homebrew': {
      use: 'pkg-homebrew',
      config: {
        tap: 'profullstack/homebrew-tap',
        formulaName: 'sh1pt',
        // populated by the CLI's build step once cross-compiled binaries exist
        binaries: [],
      },
    },
    // the lib packages ride along on npm so `sh1pt init` can pull them
    'core-npm': { use: 'pkg-npm', config: { packageDir: './packages/core', access: 'public' } },
    'sdk-npm': { use: 'pkg-npm', config: { packageDir: './packages/sdk', access: 'public' } },
    'policy-npm': { use: 'pkg-npm', config: { packageDir: './packages/policy', access: 'public' } },
    // target adapters publish individually so users install only what they need
    'target-pkg-npm-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/pkg-npm', access: 'public' } },
    'target-pkg-homebrew-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/pkg-homebrew', access: 'public' } },
    'target-mobile-ios-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/mobile-ios', access: 'public' } },
    'target-desktop-mac-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/desktop-mac', access: 'public' } },
    'target-desktop-win-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/desktop-win', access: 'public' } },
    'target-desktop-linux-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/desktop-linux', access: 'public' } },
    'target-browser-chrome-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/browser-chrome', access: 'public' } },
    'target-web-static-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/web-static', access: 'public' } },
    'target-tv-tvos-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/tv-tvos', access: 'public' } },
    'target-tv-firetv-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/tv-firetv', access: 'public' } },
    'target-tv-roku-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/tv-roku', access: 'public' } },
    'target-tv-androidtv-npm': { use: 'pkg-npm', config: { packageDir: './packages/targets/tv-androidtv', access: 'public' } },
  },
  hooks: {
    prebuild: 'pnpm -r build',
  },
});
