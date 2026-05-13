import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.arcee.ai/api';

export default defineAi<Config>({
  id: 'ai-arcee',
  label: 'Arcee AI',
  defaultModel: 'trinity-mini',
  models: ['trinity-mini', 'virtuoso-large', 'auto'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('ARCEE_API_KEY');
    if (!apiKey) throw new Error('ARCEE_API_KEY not in vault');
    const model = opts.model ?? 'trinity-mini';
    ctx.log(`arcee · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Arcee AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'ARCEE_API_KEY',
    label: 'Arcee AI',
    vendorDocUrl: 'https://docs.arcee.ai/api-reference/your-first-api-call',
    steps: [
      'Sign in to the Arcee Platform dashboard and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
