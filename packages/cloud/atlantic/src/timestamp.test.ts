import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAtlanticTimestamp } from './timestamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeAtlanticTimestamp', () => {
  it.each([
    ['1438048503', '2015-07-28T01:55:03.000Z'],
    ['1438048503000', '2015-07-28T01:55:03.000Z'],
    ['2026-06-14T00:00:00Z', '2026-06-14T00:00:00.000Z'],
  ])('normalizes provider timestamp %s', (value, expected) => {
    expect(normalizeAtlanticTimestamp(value)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    '0',
    '-1',
    '1e3',
    '1.5',
    '9007199254740992',
    '8640000000000001',
    'not-a-date',
  ])('falls back to the current time for an invalid timestamp: %s', (value) => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T18:45:00.000Z'));
    expect(normalizeAtlanticTimestamp(value)).toBe('2026-08-01T18:45:00.000Z');
  });
});
