import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig, toBotEvent } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '1234567890' });

describe('loadConfig', () => {
  it('accepts positive integer env values', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: 'telegram-token',
      SESSION_TIMEOUT_MS: '60000',
      MAX_OUTPUT_LENGTH: '1200',
      MAX_CONCURRENT_SESSIONS: '3',
    });

    expect(config.sessionTimeoutMs).toBe(60000);
    expect(config.maxOutputLength).toBe(1200);
    expect(config.maxConcurrentSessions).toBe(3);
  });

  it('uses safe defaults for invalid positive integer env values', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: 'telegram-token',
      SESSION_TIMEOUT_MS: '10seconds',
      MAX_OUTPUT_LENGTH: '1.5',
      MAX_CONCURRENT_SESSIONS: '0',
    });

    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(4000);
    expect(config.maxConcurrentSessions).toBe(5);
  });
});

describe('toBotEvent', () => {
  const message = (timestamp: number) => ({
    source: 'user-1',
    sourceName: 'User',
    text: 'hello',
    timestamp,
    chatId: 123,
    isGroup: false,
    attachments: [],
    raw: {},
  });

  it('preserves valid message timestamps', () => {
    expect(toBotEvent(message(Date.UTC(2026, 0, 1))).timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('falls back when the provider supplies an invalid timestamp', () => {
    expect(toBotEvent(message(Number.NaN)).timestamp).toBe('1970-01-01T00:00:00.000Z');
  });
});
