import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: {
    entry: 'src/main.ts',
    platforms: ['macos', 'linux'],
    channel: 'direct',
    appId: 'com.example.app',
  },
});
