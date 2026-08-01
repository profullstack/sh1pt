import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseWeChatTimestamp } from './timestamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('parseWeChatTimestamp', () => {
  it('converts a decimal Unix timestamp', () => {
    expect(parseWeChatTimestamp('1710000001')).toBe('2024-03-09T16:00:01.000Z');
  });

  it.each([
    undefined,
    '',
    '1e3',
    '1.5',
    '-1',
    ' 1710000001 ',
    '9007199254740992',
    '8640000000001',
  ])('falls back to the current time for an invalid timestamp: %s', (value) => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T18:30:00.000Z'));
    expect(parseWeChatTimestamp(value)).toBe('2026-08-01T18:30:00.000Z');
  });
});
