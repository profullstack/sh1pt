import { describe, expect, it } from 'vitest';
import { parseStripeWebhookTimestamp } from './webhook-timestamp.js';

describe('parseStripeWebhookTimestamp', () => {
  it('parses a decimal integer timestamp', () => {
    expect(parseStripeWebhookTimestamp('1700000000')).toBe(1700000000);
  });

  it.each([
    '',
    '1e3',
    '1.5',
    '-1',
    '+1',
    ' 1700000000 ',
    '9007199254740992',
  ])('rejects a malformed timestamp: %s', (value) => {
    expect(parseStripeWebhookTimestamp(value)).toBeUndefined();
  });
});
