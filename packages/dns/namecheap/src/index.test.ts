import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['NAMECHEAP_API_KEY', 'NAMECHEAP_USERNAME'],
});
