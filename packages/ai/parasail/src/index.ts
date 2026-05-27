import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.parasail.io/v1';
const DEFAULT_MODEL = 'parasail-llama-33-70b-fp8';

export default defineAi<Config>({
  id: 'ai-parasail',
  label: 'Parasail',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('PARASAIL_API_KEY');
    if (!apiKey) throw new Error('PARASAIL_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`parasail | model=${model} | ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Parasail ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    vendorDocUrl: 'https://docs.parasail.io/parasail-docs/cookbooks/chat-completions',
    steps: [
      'Sign in at https://parasail.io and create an API key',
      'Copy the key; it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
