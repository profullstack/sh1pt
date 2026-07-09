import { contractTestVcs } from '@profullstack/sh1pt-core/testing';
import vcs from './index.js';

contractTestVcs(vcs, {
  sampleConfig: { owner: 'acme', repo: 'my-app' },
  requiredSecrets: ['GITHUB_TOKEN'],
});
