import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.featherless.ai/v1';
const DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

export default defineAi<Config>({
  id: 'ai-featherless',
  label: 'Featherless',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'GalrionSoftworks/Margnum-12B-v1'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('FEATHERLESS_API_KEY');
    if (!apiKey) throw new Error('FEATHERLESS_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`featherless · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: FeatherlessMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/profullstack/sh1pt',
        'X-Title': 'sh1pt',
      },
      body: JSON.stringify({
        model,
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Featherless ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as FeatherlessChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'FEATHERLESS_API_KEY',
    label: 'Featherless',
    vendorDocUrl: 'https://featherless.ai/docs/completions',
    steps: [
      'Sign in at https://featherless.ai/account/api-keys and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type FeatherlessRole = 'system' | 'user' | 'assistant' | 'tool';

interface FeatherlessMessage {
  role: FeatherlessRole;
  content: string;
}

interface FeatherlessChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
