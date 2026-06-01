import { describe, it, expect } from 'vitest';
import { cmp } from './semver-cmp.mjs';

describe('version cmp() SemVer precedence', () => {
  it('orders plain release versions', () => {
    expect(cmp('0.3.4', '0.3.3')).toBeGreaterThan(0);
    expect(cmp('0.3.3', '0.3.4')).toBeLessThan(0);
    expect(cmp('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(cmp('0.3.3', '0.3.3')).toBe(0);
  });

  it('ranks a prerelease BELOW its own release but ABOVE the previous release', () => {
    // This is the regression: with the old map(Number) the patch of
    // "0.3.4-beta.1" was NaN, so every comparison returned NaN and the
    // max-version reduce silently kept a stale lower base.
    expect(cmp('0.3.4-beta.1', '0.3.3')).toBeGreaterThan(0);
    expect(cmp('0.3.4-beta.1', '0.3.4')).toBeLessThan(0);
    expect(cmp('0.3.4', '0.3.4-beta.1')).toBeGreaterThan(0);
  });

  it('never returns NaN for a prerelease tag', () => {
    expect(Number.isNaN(cmp('0.3.4-beta.1', '0.3.3'))).toBe(false);
  });

  it('picks the correct max base across lockstep package versions', () => {
    const versions = ['0.3.3', '0.3.4-beta.1', '0.3.3'];
    const base = versions.reduce((max, v) => (cmp(v, max) > 0 ? v : max), '0.0.0');
    // Old behaviour wrongly selected '0.3.3' as the base.
    expect(base).toBe('0.3.4-beta.1');
  });
});
