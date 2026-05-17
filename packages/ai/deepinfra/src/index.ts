import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.deepinfra.com/v1/openai';

export default defineAi<Config>({
  id: 'ai-deepinfra',
  label: 'DeepInfra',
  defaultModel: 'deepseek-ai/DeepSeek-V3',
  models: [
    'deepseek-ai/DeepSeek-V3',
    'deepseek-ai/DeepSeek-R1',
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'Qwen/Qwen3-30B-A3B',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('DEEPINFRA_API_KEY');
    if (!apiKey) throw new Error('DEEPINFRA_API_KEY not in vault');
    const model = opts.model ?? 'deepseek-ai/DeepSeek-V3';
    ctx.log(`deepinfra · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`DeepInfra ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'DEEPINFRA_API_KEY',
    label: 'DeepInfra',
    vendorDocUrl: 'https://deepinfra.com',
    steps: [
      'Sign in at https://deepinfra.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
