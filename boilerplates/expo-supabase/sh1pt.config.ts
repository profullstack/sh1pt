import { defineConfig } from '@sh1pt/core';

export default defineConfig({
  name: 'sh1pt-expo-supabase',
  version: '0.1.0',
  targets: {
    ios: {
      use: 'mobile-ios',
      config: {
        bundleId: 'com.example.sh1ptexposupabase',
        teamId: 'YOUR_TEAM_ID',
        testflightGroups: ['internal'],
      },
    },
    android: {
      use: 'mobile-android',
      config: { packageName: 'com.example.sh1ptexposupabase', track: 'internal' },
    },
    fdroid: {
      enabled: false,
      use: 'pkg-fdroid',
      config: {
        packageName: 'com.example.sh1ptexposupabase',
        mode: 'main-repo',
        metadata: {
          categories: ['Internet'],
          license: 'MIT',
          sourceRepo: 'https://github.com/YOU/sh1pt-expo-supabase',
        },
      },
    },
  },
  hooks: {
    prebuild: 'npx expo prebuild',
  },
});
