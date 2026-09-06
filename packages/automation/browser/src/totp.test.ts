import { describe, expect, it } from 'vitest';
import { base32Decode, secondsRemaining, totp, twoFactorCode } from './totp.js';

// RFC 6238 appendix B uses the ASCII seed "12345678901234567890", which is
// this in base32. Its published codes are 8 digits; a 6-digit authenticator
// shows the last six of the same number.
const RFC_SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32Decode', () => {
  it('decodes the RFC 6238 seed', () => {
    expect(base32Decode(RFC_SEED).toString('utf8')).toBe('12345678901234567890');
  });

  it('tolerates the spacing and padding sites print', () => {
    expect(base32Decode('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ')).toEqual(base32Decode(RFC_SEED));
    expect(base32Decode('MZXW6===')).toEqual(base32Decode('mzxw6'));
  });

  it('refuses input that is not base32', () => {
    expect(() => base32Decode('not-valid-1')).toThrow(/not valid base32/);
    expect(() => base32Decode('   ')).toThrow(/Empty/);
  });
});

describe('totp', () => {
  it('matches the RFC 6238 vectors', () => {
    expect(totp(RFC_SEED, { at: 59, digits: 8 })).toBe('94287082');
    expect(totp(RFC_SEED, { at: 1111111109, digits: 8 })).toBe('07081804');
    expect(totp(RFC_SEED, { at: 1234567890, digits: 8 })).toBe('89005924');
    expect(totp(RFC_SEED, { at: 2000000000, digits: 8 })).toBe('69279037');
  });

  it('defaults to the six digits an authenticator app shows', () => {
    expect(totp(RFC_SEED, { at: 59 })).toBe('287082');
  });

  it('holds one code for a whole period and changes at the boundary', () => {
    expect(totp(RFC_SEED, { at: 30 })).toBe(totp(RFC_SEED, { at: 59 }));
    expect(totp(RFC_SEED, { at: 60 })).not.toBe(totp(RFC_SEED, { at: 59 }));
  });

  it('pads a code whose value is short', () => {
    // Every code is fixed width; a small remainder must not print as 4 digits.
    for (let at = 0; at < 6000; at += 30) {
      expect(totp(RFC_SEED, { at })).toHaveLength(6);
    }
  });
});

describe('secondsRemaining', () => {
  it('counts down within the period', () => {
    expect(secondsRemaining(0)).toBe(30);
    expect(secondsRemaining(29)).toBe(1);
    expect(secondsRemaining(30)).toBe(30);
  });
});

describe('twoFactorCode', () => {
  it('asks a human when there is no seed', async () => {
    expect(await twoFactorCode(undefined, async () => '123456')).toBe('123456');
  });

  it('uses the seed instead of asking', async () => {
    // 45 sits mid-period, so this returns at once. It is the same window as
    // 59, hence the same code.
    expect(await twoFactorCode(RFC_SEED, async () => 'never', { now: () => 45 })).toBe('287082');
  });

  it('never hands back a code that is about to expire', async () => {
    // One second left is under the floor, so it waits into the next window
    // and returns that code rather than one the console would reject.
    let clock = 29;
    const pending = twoFactorCode(RFC_SEED, async () => 'never', { now: () => clock, minValiditySeconds: 3 });
    clock = 31;
    expect(await pending).toBe(totp(RFC_SEED, { at: 31 }));
  }, 10_000);
});
