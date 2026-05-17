import { contractTestTarget } from '@profullstack/sh1pt-core/testing';
import target from './index.js';

contractTestTarget(target, {
  sampleConfig: { command: 'create', args: { amount: 100, blockchain: 'BTC' }, businessId: 'biz_test' },
  requiredSecrets: ['COINPAY_API_KEY'],
});
