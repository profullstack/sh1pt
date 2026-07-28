import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { positiveEnvNumber } from './telnyx-voice';

describe('positiveEnvNumber', () => {
  it('uses valid positive numeric env values', () => {
    expect(positiveEnvNumber('12000', 8000)).toBe(12000);
  });

  it('falls back for malformed, non-finite, and non-positive values', () => {
    expect(positiveEnvNumber(undefined, 8000)).toBe(8000);
    expect(positiveEnvNumber('abc', 8000)).toBe(8000);
    expect(positiveEnvNumber('Infinity', 8000)).toBe(8000);
    expect(positiveEnvNumber('0', 8000)).toBe(8000);
    expect(positiveEnvNumber('-1', 8000)).toBe(8000);
  });
});
