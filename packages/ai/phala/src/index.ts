import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.redpill.ai/v1';

export default defineAi<Config>({
  id: 'ai-phala',
  label: 'Phala',
  defaultModel: 'phala/deepseek-chat-v3-0324',
  models: [
    'phala/deepseek-chat-v3-0324',
    'qwen/qwen2.5-vl-72b-instruct',
    'google/gemma-3-27b-it',
    'openai/gpt-oss-120b',
    'meta-llama/llama-3.3-70b-instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('PHALA_API_KEY');
    if (!apiKey) throw new Error('PHALA_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? 'phala/deepseek-chat-v3-0324';
    ctx.log(`phala · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Phala ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: 'PHALA_API_KEY',
    label: 'Phala',
    vendorDocUrl: 'https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/confidential-ai-api',
    steps: [
      'Sign in to Phala Cloud, enable Confidential AI API, and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
