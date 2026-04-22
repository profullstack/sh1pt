import { contractTestPayment } from '@profullstack/sh1pt-core/testing';
import payment from './index.js';

contractTestPayment(payment, {
  sampleConfig: { merchantId: 'm_test', acceptedCoins: ['BTC', 'USDC'] },
  requiredSecrets: ['COINPAY_API_KEY'],
});
