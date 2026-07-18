import { describe, expect, it } from 'vitest';
import { parsePositiveInteger, parsePositiveNumber } from './merch.js';

describe('merch numeric option parsers', () => {
  it('accepts decimal positive integers', () => {
    expect(parsePositiveInteger('1')).toBe(1);
    expect(parsePositiveInteger('25')).toBe(25);
  });

  it.each(['0', '-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', 'many'])(
    'rejects invalid positive integer %s',
    (value) => {
      expect(() => parsePositiveInteger(value)).toThrow('positive integer');
    },
  );

  it('accepts decimal positive money values and percentages', () => {
    expect(parsePositiveNumber('0.5')).toBe(0.5);
    expect(parsePositiveNumber('19.99')).toBe(19.99);
    expect(parsePositiveNumber('40')).toBe(40);
  });

  it.each(['0', '-1', '1e2', '0x10', 'Infinity', 'NaN', 'free'])(
    'rejects invalid positive number %s',
    (value) => {
      expect(() => parsePositiveNumber(value)).toThrow('positive finite number');
    },
  );
});
