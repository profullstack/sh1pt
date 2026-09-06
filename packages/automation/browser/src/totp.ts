/**
 * Time-based one-time passwords, RFC 6238, with no dependency.
 *
 * Both registries this package automates make two-factor mandatory before
 * they will let an account publish, so an unattended run has to produce a
 * code from somewhere. There are only two honest sources: a stored seed, or
 * a human. `twoFactorCode` prefers the seed and falls back to asking, which
 * is what makes a run schedulable once the seed is in the vault, and merely
 * *pausable* rather than broken before that.
 *
 * The seed is the same string a phone authenticator stores: the `secret=`
 * parameter of the otpauth:// URI printed beside the QR code.
 */
import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * RFC 4648 base32 to bytes. Spaces, dashes and padding are ignored, because
 * every site prints the seed in a different shape ("abcd efgh ijkl" is
 * common) and someone pasting it should not have to tidy it up first.
 */
export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean) throw new Error('Empty TOTP secret.');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`"${char}" is not valid base32; a TOTP secret is A-Z and 2-7.`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

export interface TotpOptions {
  /** Unix seconds to generate for. Defaults to now. */
  at?: number;
  digits?: number;
  periodSeconds?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
}

/** The code for a base32 seed at a moment in time. */
export function totp(secret: string, options: TotpOptions = {}): string {
  const digits = options.digits ?? 6;
  const period = options.periodSeconds ?? 30;
  const at = options.at ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(at / period);

  const message = Buffer.alloc(8);
  // Big-endian 64-bit counter, written as two 32-bit halves: the counter fits
  // in a double for any date this side of the year 275000, and
  // writeBigUInt64BE would force a BigInt allocation on every call.
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(options.algorithm ?? 'sha1', base32Decode(secret)).update(message).digest();
  // Dynamic truncation, RFC 4226 section 5.4: the low nibble of the last byte
  // picks a four-byte window. Every digest here is at least 20 bytes and the
  // offset is at most 15, so the window is always inside it; `at` keeps the
  // compiler happy about that without asserting non-null.
  const byte = (index: number): number => digest.at(index) ?? 0;
  const offset = byte(digest.length - 1) & 0x0f;
  const binary =
    ((byte(offset) & 0x7f) << 24) |
    ((byte(offset + 1) & 0xff) << 16) |
    ((byte(offset + 2) & 0xff) << 8) |
    (byte(offset + 3) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** How long the current code stays valid, in seconds. */
export function secondsRemaining(at = Math.floor(Date.now() / 1000), periodSeconds = 30): number {
  return periodSeconds - (at % periodSeconds);
}

/**
 * A code from the seed when there is one, otherwise from a human.
 *
 * With a seed this also waits out a code that is about to expire: a console
 * that takes three seconds to submit will reject a code generated in its last
 * second, and the run would fail for no reason a reader could see.
 */
export async function twoFactorCode(
  secret: string | undefined,
  ask: () => Promise<string>,
  options: { minValiditySeconds?: number; now?: () => number } = {},
): Promise<string> {
  if (!secret) return ask();
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const floor = options.minValiditySeconds ?? 3;
  const left = secondsRemaining(now());
  if (left < floor) {
    await new Promise((resolve) => setTimeout(resolve, (left + 1) * 1000));
  }
  return totp(secret, { at: now() });
}
