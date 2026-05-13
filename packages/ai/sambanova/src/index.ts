import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.sambanova.ai/v1';

export default defineAi<Config>({
  id: 'ai-sambanova',
  label: 'SambaNova',
  defaultModel: 'Meta-Llama-3.3-70B-Instruct',
  models: [
    'Meta-Llama-3.3-70B-Instruct',
    'DeepSeek-R1',
    'Llama-4-Maverick-17B-128E-Instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('SAMBANOVA_API_KEY');
    if (!apiKey) throw new Error('SAMBANOVA_API_KEY not in vault');
    const model = opts.model ?? 'Meta-Llama-3.3-70B-Instruct';
    ctx.log(`sambanova · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`SambaNova ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'SAMBANOVA_API_KEY',
    label: 'SambaNova',
    vendorDocUrl: 'https://cloud.sambanova.ai',
    steps: [
      'Sign in at https://cloud.sambanova.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
