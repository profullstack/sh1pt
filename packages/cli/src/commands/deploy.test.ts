import { describe, expect, it } from 'vitest';
import { parsePositiveFiniteNumber, parsePositiveSafeInteger } from './deploy.js';

describe('deploy numeric option parsers', () => {
  it('accepts positive safe integer resource counts', () => {
    expect(parsePositiveSafeInteger('4')).toBe(4);
  });

  it.each(['nope', '0', '-1', '1.5', 'Infinity', '9007199254740992'])(
    'rejects invalid resource count %s',
    (value) => {
      expect(() => parsePositiveSafeInteger(value)).toThrow('positive safe integer');
    },
  );

  it('accepts positive finite memory and price values', () => {
    expect(parsePositiveFiniteNumber('0.5')).toBe(0.5);
    expect(parsePositiveFiniteNumber('12.75')).toBe(12.75);
  });

  it.each(['nope', '0', '-1', 'NaN', 'Infinity', '-Infinity'])(
    'rejects invalid finite value %s',
    (value) => {
      expect(() => parsePositiveFiniteNumber(value)).toThrow('positive finite number');
    },
  );
});
