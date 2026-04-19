import { contractTestJurisdiction } from '@sh1pt/core/testing';
import pack from './index.js';

contractTestJurisdiction(pack, {
  sampleConfig: { managementType: 'algorithmically-managed' },
  sampleEntityType: 'dao-llc',
  sampleName: 'Experimental DAO LLC',
});
