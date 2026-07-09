import { contractTestCloud, fakeConnectContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'cloud', requireSupports: true });

contractTestCloud(adapter, {
  sampleConfig: { product: 'dgx-lepton', orgId: 'demo-org' },
  sampleSpec: { kind: 'gpu', gpu: { model: 'H100', count: 1 }, maxHourlyPrice: 10 },
  requiredSecrets: ['NGC_API_KEY'],
});

describe('NVIDIA cloud connection modes', () => {
  it('allows API Catalog connection without an NGC key', async () => {
    await expect(adapter.connect(fakeConnectContext() as any, {
      product: 'api-catalog',
      apiCatalog: { model: 'meta/llama-3.1-70b-instruct' },
    })).resolves.toEqual({ accountId: 'nvidia' });
  });
});
