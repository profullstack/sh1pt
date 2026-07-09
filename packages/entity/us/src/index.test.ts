import { contractTestJurisdiction } from '@profullstack/sh1pt-core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: { state: 'DE' },
  sampleEntityType: 'c-corp',
  sampleName: 'Sh1pt, Inc.',
});
