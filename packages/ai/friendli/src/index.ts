import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.friendli.ai/serverless';

export default defineAi<Config>({
  id: 'ai-friendli',
  label: 'Friendli',
  defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
  models: ['meta-llama/Llama-3.1-8B-Instruct'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('FRIENDLI_TOKEN');
    if (!apiKey) throw new Error('FRIENDLI_TOKEN not in vault');
    const model = opts.model ?? 'meta-llama/Llama-3.1-8B-Instruct';
    ctx.log(`friendli · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Friendli ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'FRIENDLI_TOKEN',
    label: 'Friendli',
    vendorDocUrl: 'https://friendli.ai/docs/openapi/model-apis/chat-completions',
    steps: [
      'Sign in to Friendli Suite and create a personal API token',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
