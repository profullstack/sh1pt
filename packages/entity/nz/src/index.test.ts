import { contractTestJurisdiction } from '@sh1pt/core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: {},
  sampleEntityType: 'company',
  sampleName: 'Kiwi Labs Limited',
});
