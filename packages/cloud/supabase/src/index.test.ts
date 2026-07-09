import { contractTestCloud, smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'cloud', requireSupports: true });

contractTestCloud(adapter, {
  sampleConfig: { projectRef: 'abcdefghijklmnopqrst', orgId: 'demo-org', region: 'us-east-1' },
  sampleSpec: { kind: 'managed-db', region: 'us-east-1' },
  requiredSecrets: ['SUPABASE_ACCESS_TOKEN'],
});
