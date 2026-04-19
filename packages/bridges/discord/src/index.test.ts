import { contractTestBridge } from '@sh1pt/core/testing';
import bridge from './index.js';

contractTestBridge(bridge, {
  sampleConfig: {},
  sampleChannel: '123456789012',
});
