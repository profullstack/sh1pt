import { contractTestCloud } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestCloud(adapter, {
  sampleConfig: {},
  sampleSpec: { kind: 'cpu-vps', cpu: 2, memory: 4, region: 'fsn1' },
  requiredSecrets: ['HCLOUD_TOKEN'],
});
