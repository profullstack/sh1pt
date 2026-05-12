import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// Cerebras — wafer-scale chip inference, extremely fast throughput.
// OpenAI-compatible Chat Completions API.
// Base URL: https://api.cerebras.ai (append /v1/chat/completions)
// Docs: https://inference-docs.cerebras.ai/api-reference/chat-completions
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.cerebras.ai';

export default defineAi<Config>({
  id: 'ai-cerebras',
  label: 'Cerebras',
  defaultModel: 'llama-3.3-70b',
  models: ['llama-3.3-70b', 'llama-3.1-8b'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('CEREBRAS_API_KEY');
    if (!apiKey) throw new Error('CEREBRAS_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'llama-3.3-70b';
    ctx.log(`cerebras · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Cerebras ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'CEREBRAS_API_KEY',
    label: 'Cerebras',
    vendorDocUrl: 'https://cloud.cerebras.ai',
    steps: [
      'Open cloud.cerebras.ai → API Keys → Create new key',
      'Copy the key',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
