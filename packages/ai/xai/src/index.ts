import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// xAI — Grok models by xAI. OpenAI-compatible Chat Completions API.
// Base URL: https://api.x.ai (append /v1/chat/completions)
// Docs: https://docs.x.ai/api
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.x.ai';

export default defineAi<Config>({
  id: 'ai-xai',
  label: 'xAI (Grok)',
  defaultModel: 'grok-3',
  models: ['grok-3', 'grok-3-mini', 'grok-2', 'grok-2-mini'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('XAI_API_KEY');
    if (!apiKey) throw new Error('XAI_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'grok-3';
    ctx.log(`xai · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v1/chat/completions`, {
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
    if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'XAI_API_KEY',
    label: 'xAI (Grok)',
    vendorDocUrl: 'https://console.x.ai',
    steps: [
      'Open console.x.ai → API Keys → Create API Key',
      'Copy the key (starts with xai-…)',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
