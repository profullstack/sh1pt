import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'hello-world',
  version: '0.1.0',
  description: 'Say hi from every surface.',
  channels: ['stable', 'beta', 'canary'],
  cloud: {
    org: 'acme',
    project: 'hello-world',
  },
  targets: {
    web: {
      use: 'web-static',
      config: {
        dir: './dist/web',
        provider: 'cloudflare-pages',
        project: 'hello-world',
        domain: 'hello.example.com',
      },
    },
    'npm-lib': {
      use: 'pkg-npm',
      config: { packageDir: './packages/sdk', access: 'public' },
    },
    brew: {
      use: 'pkg-homebrew',
      config: {
        tap: 'acme/homebrew-tap',
        formulaName: 'hello',
        binaries: [
          { platform: 'darwin-arm64', url: 'https://dl.example.com/hello-arm64.tar.gz', sha256: 'deadbeef' },
          { platform: 'darwin-x64', url: 'https://dl.example.com/hello-x64.tar.gz', sha256: 'deadbeef' },
        ],
      },
    },
    ios: {
      use: 'mobile-ios',
      config: { bundleId: 'com.acme.hello', teamId: 'ABCDE12345', testflightGroups: ['qa'] },
    },
    'chrome-ext': {
      use: 'browser-chrome',
      config: { extensionId: 'abcdefghijklmnopabcdefghijklmnop', sourceDir: './dist/ext' },
    },
  },
  hooks: {
    prebuild: 'pnpm run build',
  },
});
