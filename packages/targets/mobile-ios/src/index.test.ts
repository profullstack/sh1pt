import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'mobile', requireKind: true });

describe('iOS target', () => {
  it('rejects invalid bundle identifiers while building', async () => {
    await expect(adapter.build(fakeBuildContext({
      outDir: '/repo/.sh1pt/out',
      projectDir: '/repo',
    }) as any, {
      bundleId: '../Acme',
      teamId: 'TEAM123456',
    })).rejects.toThrow('mobile-ios bundleId must be a valid reverse-DNS identifier');
  });

  it('rejects invalid bundle identifiers while shipping', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'stable',
      dryRun: false,
      version: '1.2.3',
    }) as any, {
      bundleId: 'com.acme/ios',
      teamId: 'TEAM123456',
    })).rejects.toThrow('mobile-ios bundleId must be a valid reverse-DNS identifier');
  });
});
