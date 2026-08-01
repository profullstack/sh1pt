import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '+15551234567' });

describe('loadConfig', () => {
  it('uses defaults for malformed, fractional, non-positive, and unsafe integers', () => {
    const config = loadConfig({
      SIGNAL_PHONE_NUMBER: '+15551234567',
      SIGNAL_HTTP_PORT: '8080http',
      SESSION_TIMEOUT_MS: '1.5',
      MAX_OUTPUT_LENGTH: '0',
      MAX_CONCURRENT_SESSIONS: '9007199254740992',
    });

    expect(config.httpPort).toBe(7580);
    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });

  it('accepts positive safe integer strings', () => {
    const config = loadConfig({
      SIGNAL_PHONE_NUMBER: '+15551234567',
      SIGNAL_HTTP_PORT: '8080',
      SESSION_TIMEOUT_MS: '60000',
      MAX_OUTPUT_LENGTH: '2000',
      MAX_CONCURRENT_SESSIONS: '3',
    });

    expect(config.httpPort).toBe(8080);
    expect(config.sessionTimeoutMs).toBe(60000);
    expect(config.maxOutputLength).toBe(2000);
    expect(config.maxConcurrentSessions).toBe(3);
  });
});
