import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { command: 'create', args: { amount: 100, currency: 'USD' } },
  requiredSecrets: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
});