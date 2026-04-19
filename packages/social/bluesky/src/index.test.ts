import { contractTestSocial } from '@sh1pt/core/testing';
import social from './index.js';

contractTestSocial(social, {
  sampleConfig: { handle: 'test.bsky.social' },
  samplePost: { body: 'hello from sh1pt contract tests' },
  requiredSecrets: ['BLUESKY_APP_PASSWORD'],
});
