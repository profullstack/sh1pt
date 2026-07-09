import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestTarget, fakeBuildContext, fakeShipContext } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('chat-telegram API calls', () => {
  it('writes a Telegram manifest artifact', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-telegram-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({ outDir }) as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'https://example.com/telegram',
      commands: [{ command: '/start', description: 'Start the bot' }],
      directoryListings: ['storebot.me'],
    });

    expect(result.artifact).toBe(join(outDir, 'telegram-demo_bot.json'));
    expect(result.meta).toEqual({
      botUrl: 'https://t.me/demo_bot',
      commands: 1,
    });

    const manifest = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'telegram',
      botUsername: 'demo_bot',
      webhookUrl: 'https://example.com/telegram',
      botUrl: 'https://t.me/demo_bot',
      commands: [{ command: 'start', description: 'Start the bot' }],
      directoryListings: ['storebot.me'],
    });
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
      webhookUrl: 'https://example.com/telegram',
    })).rejects.toThrow('Bad Request: invalid webhook url');
  });

  it('rejects invalid Telegram config before API calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(adapter.build(fakeBuildContext() as any, {
      botUsername: '../demo/bot',
      webhookUrl: 'https://example.com/telegram',
    })).rejects.toThrow('botUsername must be 5-32 characters');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'http://example.com/telegram',
    })).rejects.toThrow('webhookUrl must be an https URL');

    await expect(adapter.ship(fakeShipContext({ dryRun: false }) as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'https://example.com/telegram',
      commands: [{ command: '/Start', description: 'Start the bot' }],
    })).rejects.toThrow('command must contain 1-32 lowercase');

    await expect(adapter.build(fakeBuildContext() as any, {
      botUsername: 'demo_bot',
      webhookUrl: 'https://example.com/telegram',
      directoryListings: ['unknown.example'],
    } as any)).rejects.toThrow('directoryListings must be storebot.me or combot.org');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
