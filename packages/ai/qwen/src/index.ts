import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// Qwen via Alibaba's DashScope. Two surfaces: native DashScope JSON, and
// an OpenAI-compatible endpoint at /compatible-mode/v1/chat/completions.
// We use the OpenAI-compatible mode — same wire format as the OpenAI
// adapter but a different host + key, which lets us share the body shape.
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://dashscope-intl.aliyuncs.com';

export default defineAi<Config>({
  id: 'ai-qwen',
  label: 'Qwen (Alibaba DashScope)',
  defaultModel: 'qwen-max',
  models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen3-coder-plus'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('DASHSCOPE_API_KEY');
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY not in vault');
    const model = opts.model ?? 'qwen-max';
    ctx.log(`qwen · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/compatible-mode/v1/chat/completions`, {
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
    if (!res.ok) throw new Error(`DashScope ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

  setup: tokenSetup({
    secretKey: 'DASHSCOPE_API_KEY',
    label: 'Qwen (DashScope)',
    vendorDocUrl: 'https://dashscope.console.aliyun.com/apiKey',
    steps: [
      'Open dashscope.console.aliyun.com → API-KEY Management → Create',
      'Copy the key (starts with sk-…) — shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
