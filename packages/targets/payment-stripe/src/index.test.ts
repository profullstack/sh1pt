import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { command: 'create', args: { amount: 2000, currency: 'usd' }, description: 'test payment' },
  requiredSecrets: ['STRIPE_API_KEY'],
});
