import { describe, expect, it } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot, { loadConfig } from './index.js';

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
