import { contractTestDns } from '@sh1pt/core/testing';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['DNSIMPLE_API_TOKEN'],
});
