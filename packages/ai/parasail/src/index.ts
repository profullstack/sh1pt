import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.parasail.io/v1';

export default defineAi<Config>({
  id: 'ai-parasail',
  label: 'Parasail',
  defaultModel: 'llama-3.1-8b',
  models: [
    'llama-3.1-8b',
    'llama-3.1-70b',
    'mistral-7b',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('PARASAIL_API_KEY');
    if (!apiKey) throw new Error('PARASAIL_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'llama-3.1-8b';
    ctx.log(`parasail · model=`+model+` · `+prompt.length+` chars in`);
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
    if (!res.ok) {
      const excerpt = (await res.text()).slice(0, 200);
      throw new Error(`parasail ${res.status}: ${excerpt}`);
    }
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
    secretKey: 'PARASAIL_API_KEY',
    label: 'Parasail',
    vendorDocUrl: 'https://docs.parasail.io',
    steps: [
      'Sign in at https://docs.parasail.io and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
