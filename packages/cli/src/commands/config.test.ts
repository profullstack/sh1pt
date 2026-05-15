import { describe, expect, it, vi } from 'vitest';
import { configCmd } from './config.js';

describe('config webhooks subscriptions', () => {
  it('prints machine-readable subscription listings', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';

    try {
      await configCmd.parseAsync(['webhooks', 'sub', 'list', '--json'], { from: 'user' });
      output = log.mock.calls.map(([line]) => String(line)).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(JSON.parse(output)).toEqual({ subscriptions: [] });
  });
});
