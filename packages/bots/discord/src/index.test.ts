import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig, toBotEvent } from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '1234567890' });

describe('loadConfig', () => {
  it('uses safe defaults for invalid positive integer env values', () => {
    const config = loadConfig({
      DISCORD_BOT_TOKEN: 'discord-token',
      SESSION_TIMEOUT_MS: 'not-a-number',
      MAX_OUTPUT_LENGTH: '0',
      MAX_CONCURRENT_SESSIONS: '-2',
    });

    expect(config.sessionTimeoutMs).toBe(1800000);
    expect(config.maxOutputLength).toBe(2000);
    expect(config.maxConcurrentSessions).toBe(5);
  });
});

describe('toBotEvent', () => {
  it('falls back when Discord provides an out-of-range timestamp', () => {
    expect(toBotEvent({
      source: 'user-1',
      sourceName: 'User',
      text: 'hello',
      timestamp: Number.NEGATIVE_INFINITY,
      channelId: 'channel-1',
      guildId: null,
      isGuild: false,
      attachments: [],
      raw: undefined as never,
    }).timestamp).toBe('1970-01-01T00:00:00.000Z');
  });
});
