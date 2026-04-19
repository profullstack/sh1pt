import { contractTestCloud } from '@sh1pt/core/testing';
import cloud from './index.js';

contractTestCloud(cloud, {
  sampleConfig: { cloudType: 'COMMUNITY' },
  sampleSpec: { kind: 'gpu', gpu: { model: 'A100-40GB', count: 1 } },
  requiredSecrets: ['RUNPOD_API_KEY'],
});
