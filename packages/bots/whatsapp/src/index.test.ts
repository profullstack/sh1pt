import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig, toIsoTimestamp } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '15551234567@s.whatsapp.net' });

afterEach(() => {
  vi.useRealTimers();
});

describe('toIsoTimestamp', () => {
  it('preserves a valid millisecond timestamp', () => {
    expect(toIsoTimestamp(Date.UTC(2026, 7, 1, 19, 30))).toBe('2026-08-01T19:30:00.000Z');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    'falls back to the current time for invalid timestamp %s',
    (value) => {
      vi.useFakeTimers().setSystemTime(new Date('2026-08-01T20:00:00.000Z'));
      expect(toIsoTimestamp(value)).toBe('2026-08-01T20:00:00.000Z');
    },
  );
});

describe('loadConfig', () => {
  it('accepts positive integer environment limits', () => {
    const config = loadConfig({
      SESSION_TIMEOUT_MS: '60000',
      MAX_OUTPUT_LENGTH: '1200',
      MAX_CONCURRENT_SESSIONS: '3',
    });

    expect(config.sessionTimeoutMs).toBe(60000);
    expect(config.maxOutputLength).toBe(1200);
    expect(config.maxConcurrentSessions).toBe(3);
  });

  it('uses safe defaults for malformed or unsafe environment limits', () => {
    const config = loadConfig({
      SESSION_TIMEOUT_MS: '10seconds',
      MAX_OUTPUT_LENGTH: '1.5',
      MAX_CONCURRENT_SESSIONS: '9007199254740993',
    });

    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });

  it('uses defaults for non-positive and non-decimal integer values', () => {
    const config = loadConfig({
      SESSION_TIMEOUT_MS: '0',
      MAX_OUTPUT_LENGTH: '0x7d0',
      MAX_CONCURRENT_SESSIONS: '1e2',
    });

    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });
});
