import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMatrixTimestamp } from './timestamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('parseMatrixTimestamp', () => {
  it('converts a millisecond timestamp', () => {
    expect(parseMatrixTimestamp(1779336000000)).toBe('2026-05-21T04:00:00.000Z');
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
    8640000000000001,
  ])('falls back to the current time for an invalid timestamp: %s', (value) => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T18:35:00.000Z'));
    expect(parseMatrixTimestamp(value)).toBe('2026-08-01T18:35:00.000Z');
  });
});
