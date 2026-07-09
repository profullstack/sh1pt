import { contractTestCloud, smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'cloud', requireSupports: true });

contractTestCloud(adapter, {
  sampleConfig: { projectId: 'demo-project' },
  sampleSpec: { kind: 'managed-db', region: 'us-central1' },
  requiredSecrets: ['FIREBASE_TOKEN'],
});
