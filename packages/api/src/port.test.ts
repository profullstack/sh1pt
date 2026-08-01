import { describe, expect, it } from 'vitest';
import { DEFAULT_API_PORT, resolveApiPort } from './port.js';

describe('resolveApiPort', () => {
  it('uses the default when PORT is absent', () => {
    expect(resolveApiPort(undefined)).toBe(DEFAULT_API_PORT);
  });

  it('accepts decimal ports in the valid range', () => {
    expect(resolveApiPort('8080')).toBe(8080);
    expect(resolveApiPort(' 443 ')).toBe(443);
    expect(resolveApiPort('0')).toBe(0);
  });

  it('falls back for non-decimal, negative, and out-of-range values', () => {
    for (const value of ['1e3', '0x1f90', '4000oops', '-1', '65536', '9007199254740992']) {
      expect(resolveApiPort(value)).toBe(DEFAULT_API_PORT);
    }
  });
});
