import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.venice.ai/api/v1';
const DEFAULT_MODEL = 'zai-org-glm-4.7';

export default defineAi<Config>({
  id: 'ai-venice',
  label: 'Venice AI',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'venice-uncensored',
    'deepseek-v3.2',
    'qwen3-4b',
    'mistral-31-24b',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('VENICE_API_KEY');
    if (!apiKey) throw new Error('VENICE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`venice · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: VeniceMessage[] = [];
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
    if (!res.ok) throw new Error(`Venice ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as VeniceChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'VENICE_API_KEY',
    label: 'Venice AI',
    vendorDocUrl: 'https://docs.venice.ai/api-reference/endpoint/chat/completions',
    steps: [
      'Sign in at https://venice.ai/settings/api and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type VeniceRole = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

interface VeniceMessage {
  role: VeniceRole;
  content: string;
}

interface VeniceChatResponse {
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
