import { fakeBuildContext, fakeShipContext, makeVault, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'chat', requireKind: true });

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const baseConfig = {
  phoneNumberId: '1234567890',
  wabaId: '9876543210',
  webhookUrl: 'https://hooks.example.com/whatsapp',
  templates: [{
    name: 'order_update',
    language: 'en_US',
    category: 'UTILITY' as const,
    body: 'Hi {{1}}, order {{2}} is ready.',
    examples: ['Sam', 'A-123'],
  }],
};

describe('WhatsApp Business Cloud API target', () => {
  it('writes a template manifest with Graph API endpoints', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-whatsapp-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
    }) as any, baseConfig);

    expect(result.artifact).toBe(join(outDir, 'whatsapp-templates.json'));
    expect(result.meta).toEqual({
      templates: ['order_update'],
      endpoints: {
        messages: 'https://graph.facebook.com/v25.0/1234567890/messages',
        templates: 'https://graph.facebook.com/v25.0/9876543210/message_templates',
        subscribedApps: 'https://graph.facebook.com/v25.0/9876543210/subscribed_apps',
      },
    });

    const manifest = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(manifest).toMatchObject({
      provider: 'chat-whatsapp',
      graphApiVersion: 'v25.0',
      subscribeApp: true,
      templates: [{
        name: 'order_update',
        language: 'en_US',
        category: 'UTILITY',
        placeholderIndexes: [1, 2],
        components: [{
          type: 'BODY',
          text: 'Hi {{1}}, order {{2}} is ready.',
          example: { body_text: [['Sam', 'A-123']] },
        }],
      }],
    });
  });

  it('rejects templates with non-contiguous placeholders', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      ...baseConfig,
      templates: [{
        name: 'bad_template',
        language: 'en_US',
        category: 'UTILITY',
        body: 'Hi {{1}}, order {{3}} is ready.',
      }],
    })).rejects.toThrow('placeholders must be contiguous from {{1}}');
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({ dryRun: true }) as any, baseConfig))
      .resolves.toMatchObject({
        id: 'dry-run',
        meta: {
          templates: ['order_update'],
          subscribeApp: true,
        },
      });
  });

  it('submits templates and subscribes WABA webhooks through Graph API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'template_1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.ship(fakeShipContext({
      dryRun: false,
      version: '1.2.3',
      secret: makeVault({
        WHATSAPP_BUSINESS_TOKEN: 'mock-token',
        WHATSAPP_VERIFY_TOKEN: 'mock-verify',
      }),
    }) as any, {
      ...baseConfig,
      verifyTokenKey: 'WHATSAPP_VERIFY_TOKEN',
    });

    expect(result).toEqual({
      id: '1234567890@1.2.3',
      url: 'https://business.facebook.com/wa/manage/phone-numbers/?waba_id=9876543210',
      meta: {
        templates: [{ name: 'order_update', id: 'template_1' }],
        subscription: { success: true },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const templateCall = fetchMock.mock.calls[0];
    const subscriptionCall = fetchMock.mock.calls[1];
    expect(templateCall).toBeDefined();
    expect(subscriptionCall).toBeDefined();
    expect(templateCall![0]).toBe('https://graph.facebook.com/v25.0/9876543210/message_templates');
    expect(subscriptionCall![0]).toBe('https://graph.facebook.com/v25.0/9876543210/subscribed_apps');

    const templateRequest = templateCall![1] as RequestInit;
    expect((templateRequest.headers as Record<string, string>).authorization).toBe('Bearer mock-token');
    expect(JSON.parse(String(templateRequest.body))).toEqual({
      name: 'order_update',
      language: 'en_US',
      category: 'UTILITY',
      components: [{
        type: 'BODY',
        text: 'Hi {{1}}, order {{2}} is ready.',
        example: { body_text: [['Sam', 'A-123']] },
      }],
    });

    const subscriptionRequest = JSON.parse(String((subscriptionCall![1] as RequestInit).body));
    expect(subscriptionRequest).toEqual({
      override_callback_uri: 'https://hooks.example.com/whatsapp',
      verify_token: 'mock-verify',
    });
  });

  it('redacts token values from Graph API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: 190,
          message: 'Invalid token mock-token',
        },
      }),
    }));

    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
      secret: makeVault({ WHATSAPP_BUSINESS_TOKEN: 'mock-token' }),
    }) as any, baseConfig)).rejects.toThrow('Invalid token [redacted]');
  });
});
