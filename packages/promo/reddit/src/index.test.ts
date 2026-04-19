import { contractTestAdPlatform } from '@sh1pt/core/testing';
import platform from './index.js';

contractTestAdPlatform(platform, {
  sampleConfig: { accountId: 'acct-stub', fundingInstrumentId: 'fund-stub' },
  requiredSecrets: [],  // reddit adapter currently checks config.accountId, not a secret in connect()
});
