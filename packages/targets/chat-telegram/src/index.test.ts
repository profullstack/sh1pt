import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestTarget, fakeBuildContext, fakeShipContext } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import adapter from './index.js';

contractTestTarget(adapter, {
  sampleConfig: {
    botUsername: 'demo_bot',
    webhookUrl: 'https://example.com/telegram',
    commands: [{ command: 'start', description: 'Start the bot' }],
  },
});

afterEach(() => {
  vi.restoreAllMocks();
});

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('chat-telegram API calls', () => {
  it('keeps bot usernames with path separators inside the output directory', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-telegram-out-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      dryRun: true,
    }) as any, {
      botUsername: '../demo_bot',
      webhookUrl: 'https://example.com/telegram',
    });

    expect(result.artifact).toBe(join(outDir, 'telegram-demo_bot.json'));
  });

  it('sets webhook, commands, and bot descriptions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: true }),
    } as any);

    const ctx = fakeShipContext({
      dryRun: false,
      secret: (key: string) => ({
        TELEGRAM_BOT_TOKEN: '123:test-token',
        TELEGRAM_WEBHOOK_SECRET: 'secret-token',
      })[key],
    });

    await adapter.ship(ctx as any, {
      botUsername: '@demo_bot',
      webhookUrl: 'https://example.com/telegram',
      webhookSecretKey: 'TELEGRAM_WEBHOOK_SECRET',
      commands: [{ command: '/start', description: 'Start the bot' }],
      description: 'Long bot description',
      shortDescription: 'Short bot description',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [webhookUrl, webhookInit] = fetchMock.mock.calls[0]!;
    expect(String(webhookUrl)).toContain('/setWebhook');
    expect(JSON.parse(String((webhookInit as RequestInit).body))).toEqual({
      url: 'https://example.com/telegram',
      secret_token: 'secret-token',
    });

    const [, commandsInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String((commandsInit as RequestInit).body))).toEqual({
      commands: [{ command: 'start', description: 'Start the bot' }],
    });
  });

  it('requires TELEGRAM_BOT_TOKEN outside dry-run', async () => {
    const ctx = fakeShipContext({ dryRun: false });
    await expect(adapter.ship(ctx as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'https://example.com/telegram',
    })).rejects.toThrow('TELEGRAM_BOT_TOKEN not in vault');
  });

  it('surfaces Telegram API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: 'Bad Request: invalid webhook url' }),
    } as any);

    const ctx = fakeShipContext({
      dryRun: false,
      secret: (key: string) => key === 'TELEGRAM_BOT_TOKEN' ? '123:test-token' : undefined,
    });

    await expect(adapter.ship(ctx as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'not-a-url',
    })).rejects.toThrow('Bad Request: invalid webhook url');
  });
});
