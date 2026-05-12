import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// Mistral AI — European frontier models (Mistral Large, Nemo, etc.).
// OpenAI-compatible Chat Completions API.
// Base URL: https://api.mistral.ai (append /v1/chat/completions)
// Docs: https://docs.mistral.ai/api/
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.mistral.ai';

export default defineAi<Config>({
  id: 'ai-mistral',
  label: 'Mistral AI',
  defaultModel: 'mistral-large-latest',
  models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo', 'codestral-latest'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('MISTRAL_API_KEY');
    if (!apiKey) throw new Error('MISTRAL_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'mistral-large-latest';
    ctx.log(`mistral · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'MISTRAL_API_KEY',
    label: 'Mistral AI',
    vendorDocUrl: 'https://console.mistral.ai/api-keys',
    steps: [
      'Open console.mistral.ai → API Keys → Create new key',
      'Copy the key',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
