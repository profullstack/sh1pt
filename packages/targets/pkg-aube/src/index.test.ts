import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { packageDir: './fake', packageName: '@acme/fake', access: 'public' },
});
