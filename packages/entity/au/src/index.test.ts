import { contractTestJurisdiction } from '@sh1pt/core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: {},
  sampleEntityType: 'private-company',
  sampleName: 'Aussie Labs Pty Ltd',
});
