import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.fireworks.ai/inference/v1';

export default defineAi<Config>({
  id: 'ai-fireworks',
  label: 'Fireworks AI',
  defaultModel: 'accounts/fireworks/models/deepseek-v3p2',
  models: [
    'accounts/fireworks/models/deepseek-v3p2',
    'accounts/fireworks/models/deepseek-r1',
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('FIREWORKS_API_KEY');
    if (!apiKey) throw new Error('FIREWORKS_API_KEY not in vault');
    const model = opts.model ?? 'accounts/fireworks/models/deepseek-v3p2';
    ctx.log(`fireworks · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Fireworks AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'FIREWORKS_API_KEY',
    label: 'Fireworks AI',
    vendorDocUrl: 'https://fireworks.ai',
    steps: [
      'Sign in at https://fireworks.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
