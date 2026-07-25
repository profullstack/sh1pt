import { describe, expect, it } from 'vitest';
import { parseNonNegativeInteger, parsePositiveInteger } from './promote.js';

describe('promote numeric option parsers', () => {
  it('accepts decimal positive integers', () => {
    expect(parsePositiveInteger('25')).toBe(25);
  });

  it.each(['0', '-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', 'abc', '9007199254740993'])(
    'rejects invalid positive integer %s',
    (value) => {
      expect(() => parsePositiveInteger(value)).toThrow('positive integer');
    },
  );

  it('accepts decimal non-negative integers', () => {
    expect(parseNonNegativeInteger('0')).toBe(0);
    expect(parseNonNegativeInteger('2000')).toBe(2000);
  });

  it.each(['-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', 'abc', '9007199254740993'])(
    'rejects invalid non-negative integer %s',
    (value) => {
      expect(() => parseNonNegativeInteger(value)).toThrow('zero or a positive integer');
    },
  );
});
