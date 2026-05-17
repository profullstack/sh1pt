import { contractTestDns } from '@profullstack/sh1pt-core/testing';
import dns from './index.js';

contractTestDns(dns, {
  sampleConfig: {},
  requiredSecrets: ['GOOGLE_ACCESS_TOKEN', 'GOOGLE_PROJECT_ID'],
});
