import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '15551234567@s.whatsapp.net' });

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
});
