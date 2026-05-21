import { contractTestMerch, smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'merch', requireSupports: true });

contractTestMerch(adapter, {
  sampleConfig: { shopId: 12345, preferredPrintProvider: 678 },
  sampleProduct: {
    kind: 'tshirt',
    title: 'Test shirt',
    designs: [{ file: '/tmp/logo.png' }],
    colors: ['black'],
    sizes: ['M'],
    retailPrice: 25,
  },
  requiredSecrets: ['PRINTIFY_TOKEN'],
});
