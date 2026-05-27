import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.cohere.ai/compatibility/v1';
const DEFAULT_MODEL = 'command-a-plus-05-2026';

export default defineAi<Config>({
  id: 'ai-cohere',
  label: 'Cohere',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'command-a-03-2025'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('COHERE_API_KEY');
    if (!apiKey) throw new Error('COHERE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`cohere | model=${model} | ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
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
    if (!res.ok) throw new Error(`Cohere ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'COHERE_API_KEY',
    label: 'Cohere',
    vendorDocUrl: 'https://docs.cohere.com/v2/docs/compatibility-api',
    steps: [
      'Sign in at https://dashboard.cohere.com and create an API key',
      'Copy the key; it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
