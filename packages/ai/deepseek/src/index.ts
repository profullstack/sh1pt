import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// DeepSeek — high-capability models with competitive pricing.
// OpenAI-compatible Chat Completions API.
// Base URL: https://api.deepseek.com (append /v1/chat/completions)
// Docs: https://platform.deepseek.com/api-docs
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.deepseek.com';

export default defineAi<Config>({
  id: 'ai-deepseek',
  label: 'DeepSeek',
  defaultModel: 'deepseek-chat',
  models: ['deepseek-chat', 'deepseek-reasoner'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'deepseek-chat';
    ctx.log(`deepseek · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    vendorDocUrl: 'https://platform.deepseek.com/api-docs',
    steps: [
      'Open platform.deepseek.com → API Keys → Create new API key',
      'Copy the key',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
