import { contractTestMerch } from '@profullstack/sh1pt-core/testing';
import merch from './index.js';

contractTestMerch(merch, {
  sampleConfig: { storefront: 'printful-branded' },
  sampleProduct: {
    kind: 'tshirt',
    title: 'Test shirt',
    designs: [{ file: '/tmp/logo.png' }],
    colors: ['black'],
    sizes: ['M'],
    retailPrice: 25,
  },
  requiredSecrets: ['PRINTFUL_TOKEN'],
});
