import { describe, expect, it, vi } from 'vitest';
import { openrouterProvider } from './provider.js';

describe('openrouter agent provider', () => {
  it('declares correct id and displayName', () => {
    expect(openrouterProvider.id).toBe('openrouter');
    expect(openrouterProvider.displayName).toBe('OpenRouter');
  });

  it('declares chat capability', () => {
    expect(openrouterProvider.capabilities.chat).toBe(true);
  });

  it('lists required env vars', () => {
    const env = openrouterProvider.getRequiredEnv();
    expect(env).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'OPENROUTER_API_KEY', required: true }),
        expect.objectContaining({ key: 'OPENROUTER_BASE_URL', required: false }),
        expect.objectContaining({ key: 'OPENROUTER_HTTP_REFERER', required: false }),
        expect.objectContaining({ key: 'OPENROUTER_X_TITLE', required: false }),
      ]),
    );
  });

  it('validateEnv throws when OPENROUTER_API_KEY is missing', () => {
    expect(() => openrouterProvider.validateEnv({})).toThrow('Missing OPENROUTER_API_KEY');
  });

  it('validateEnv passes when OPENROUTER_API_KEY is set', () => {
    expect(() => openrouterProvider.validateEnv({ OPENROUTER_API_KEY: 'sk-test-key' })).not.toThrow();
  });

  it('chat throws AgentProviderConfigError without OPENROUTER_API_KEY', async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      await expect(
        openrouterProvider.chat({ messages: [{ role: 'user', content: 'hello' }] }),
      ).rejects.toThrow('Missing OPENROUTER_API_KEY');
    } finally {
      if (original) process.env.OPENROUTER_API_KEY = original;
    }
  });

  it('chat calls OpenRouter API and returns content', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from OpenRouter!' } }],
      }),
    } as any);

    try {
      const result = await openrouterProvider.chat({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Say hi' },
        ],
      });

      expect(result.content).toBe('Hello from OpenRouter!');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
            'Content-Type': 'application/json',
          }),
        }),
      );

      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as any).body));
      expect(body.model).toBe('openai/gpt-4o-mini');
      expect(body.messages).toHaveLength(2);
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      fetchMock.mockRestore();
    }
  });

  it('chat respects OPENROUTER_MODEL env var', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Claude response' } }],
      }),
    } as any);

    try {
      await openrouterProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as any).body));
      expect(body.model).toBe('anthropic/claude-3.5-sonnet');
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_MODEL;
      fetchMock.mockRestore();
    }
  });

  it('chat sends optional HTTP-Referer and X-Title headers', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';
    process.env.OPENROUTER_HTTP_REFERER = 'https://myapp.com';
    process.env.OPENROUTER_X_TITLE = 'My App';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    } as any);

    try {
      await openrouterProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      const init = fetchMock.mock.calls[0]![1] as any;
      expect(init.headers['HTTP-Referer']).toBe('https://myapp.com');
      expect(init.headers['X-Title']).toBe('My App');
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_HTTP_REFERER;
      delete process.env.OPENROUTER_X_TITLE;
      fetchMock.mockRestore();
    }
  });

  it('chat throws on non-OK API response', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as any);

    try {
      await expect(
        openrouterProvider.chat({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('OpenRouter chat 429');
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      fetchMock.mockRestore();
    }
  });

  it('chat throws on empty response', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: null } }] }),
    } as any);

    try {
      await expect(
        openrouterProvider.chat({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('OpenRouter empty response');
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      fetchMock.mockRestore();
    }
  });

  it('chat respects OPENROUTER_BASE_URL env var', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';
    process.env.OPENROUTER_BASE_URL = 'https://custom-gateway.example.com/v1';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'custom gateway' } }],
      }),
    } as any);

    try {
      await openrouterProvider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://custom-gateway.example.com/v1/chat/completions',
        expect.anything(),
      );
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_BASE_URL;
      fetchMock.mockRestore();
    }
  });

  it('healthcheck returns ok when env is validated', async () => {
    const result = await openrouterProvider.healthcheck();
    expect(result.ok).toBe(true);
  });

  it('listModels throws not implemented', async () => {
    await expect(openrouterProvider.listModels()).rejects.toThrow('not implemented');
  });
});