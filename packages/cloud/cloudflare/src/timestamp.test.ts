import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeCloudflareTimestamp } from './timestamp.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeCloudflareTimestamp', () => {
  it('normalizes a valid provider timestamp', () => {
    expect(normalizeCloudflareTimestamp('2026-06-14T00:00:00Z')).toBe('2026-06-14T00:00:00.000Z');
  });

  it.each([
    undefined,
    '',
    'not-a-date',
    '999999999999999999999',
  ])('falls back to the current time for an invalid timestamp: %s', (value) => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-01T18:40:00.000Z'));
    expect(normalizeCloudflareTimestamp(value)).toBe('2026-08-01T18:40:00.000Z');
  });
});
