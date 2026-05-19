import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'http://localhost:4000';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export default defineAi<Config>({
  id: 'ai-litellm',
  label: 'LiteLLM',
  defaultModel: 'gpt-4o-mini',
  models: [
    'gpt-4o-mini',
    'gpt-4o',
    'anthropic/claude-3-5-sonnet',
    'gemini/gemini-1.5-pro',
    'ollama/llama3.1',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('LITELLM_API_KEY');
    if (!apiKey) throw new Error('LITELLM_API_KEY not in vault');
    const model = opts.model ?? 'gpt-4o-mini';
    ctx.log(`litellm · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const baseUrl = trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE);
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`LiteLLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      model: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'LITELLM_API_KEY',
    label: 'LiteLLM',
    vendorDocUrl: 'https://docs.litellm.ai/docs/proxy/quick_start',
    steps: [
      'Start a LiteLLM proxy or use a hosted LiteLLM gateway',
      'Create or copy the proxy API key',
      'Paste below; sh1pt encrypts it in the vault',
    ],
    fields: [
      { key: 'baseUrl', message: 'LiteLLM proxy base URL (default: http://localhost:4000):' },
    ],
  }),
});
