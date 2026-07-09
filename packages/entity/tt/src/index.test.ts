import { contractTestJurisdiction } from '@profullstack/sh1pt-core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: {},
  sampleEntityType: 'private-company',
  sampleName: 'Example Trinidad and Tobago Private Limited',
});
