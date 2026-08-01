import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig, toBotEvent } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '+15551234567' });

describe('loadConfig', () => {
  it('accepts positive integer environment values', () => {
    const config = loadConfig({
      SIGNAL_PHONE_NUMBER: '+15551234567',
      SIGNAL_HTTP_PORT: '8080',
      SESSION_TIMEOUT_MS: '60000',
      MAX_OUTPUT_LENGTH: '1200',
      MAX_CONCURRENT_SESSIONS: '3',
    });

    expect(config.httpPort).toBe(8080);
    expect(config.sessionTimeoutMs).toBe(60000);
    expect(config.maxOutputLength).toBe(1200);
    expect(config.maxConcurrentSessions).toBe(3);
  });

  it('uses safe defaults for malformed or unsafe integer values', () => {
    const config = loadConfig({
      SIGNAL_PHONE_NUMBER: '+15551234567',
      SIGNAL_HTTP_PORT: '8080http',
      SESSION_TIMEOUT_MS: '10seconds',
      MAX_OUTPUT_LENGTH: '1.5',
      MAX_CONCURRENT_SESSIONS: '9007199254740993',
    });

    expect(config.httpPort).toBe(7580);
    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });

  it('uses defaults for non-positive and non-decimal integer values', () => {
    const config = loadConfig({
      SIGNAL_PHONE_NUMBER: '+15551234567',
      SIGNAL_HTTP_PORT: '0x1f90',
      SESSION_TIMEOUT_MS: '0',
      MAX_OUTPUT_LENGTH: '-1',
      MAX_CONCURRENT_SESSIONS: '1e2',
    });

    expect(config.httpPort).toBe(7580);
    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });
});

describe('toBotEvent', () => {
  it('falls back when Signal provides an out-of-range timestamp', () => {
    expect(toBotEvent({
      source: 'user-1',
      sourceName: 'User',
      text: 'hello',
      timestamp: Number.POSITIVE_INFINITY,
      groupId: undefined,
      attachments: [],
      raw: {},
    }).timestamp).toBe('1970-01-01T00:00:00.000Z');
  });
});
