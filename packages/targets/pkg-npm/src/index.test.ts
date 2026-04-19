import { contractTestTarget } from '@sh1pt/core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { packageDir: './fake', access: 'public' },
});
