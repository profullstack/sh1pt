import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['DO_API_TOKEN'],
});
