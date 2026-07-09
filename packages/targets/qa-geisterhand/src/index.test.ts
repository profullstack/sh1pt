import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: {
    app: './build/MyApp.app',
    plan: 'geisterhand.plan.json',
  },
});
