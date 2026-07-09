import { fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

describe('Fly.io target adapter', () => {
  it('rejects unsupported deployment strategies', async () => {
    await expect(adapter.ship(fakeShipContext({
      channel: 'stable',
      dryRun: true,
    }) as any, {
      app: 'acme-app',
      strategy: 'preview',
    } as any)).rejects.toThrow('deploy-fly strategy must be one of: rolling, canary, bluegreen, immediate');
  });
});
