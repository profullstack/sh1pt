import { contractTestDns } from '@sh1pt/core/testing';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['PORKBUN_API_KEY', 'PORKBUN_API_SECRET'],
});
