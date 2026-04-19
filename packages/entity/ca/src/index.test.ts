import { contractTestJurisdiction } from '@sh1pt/core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: { jurisdiction: 'federal' },
  sampleEntityType: 'company',
  sampleName: 'Maple Labs Inc.',
});
