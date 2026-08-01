import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig, parseTelegramChatId } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '1234567890' });

describe('parseTelegramChatId', () => {
  it('accepts positive user and negative group chat ids', () => {
    expect(parseTelegramChatId('1234567890')).toBe(1234567890);
    expect(parseTelegramChatId('-1001234567890')).toBe(-1001234567890);
  });

  it.each(['', '0', '-0', '1.5', '1e2', '0x10', ' 123 ', 'NaN', '9007199254740993'])(
    'rejects malformed or unsafe chat id %j',
    (value) => {
      expect(() => parseTelegramChatId(value)).toThrow(`Invalid Telegram chat id: ${value}`);
    },
  );
});

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
