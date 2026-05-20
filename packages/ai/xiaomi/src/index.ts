import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash';

export default defineAi<Config>({
  id: 'ai-xiaomi',
  label: 'Xiaomi MiMo',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'xiaomi/mimo-v2-pro', 'xiaomi/mimo-v2-omni'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('XIAOMI_API_KEY');
    if (!apiKey) throw new Error('XIAOMI_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`xiaomi · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: XiaomiMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${(config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Xiaomi MiMo ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as XiaomiChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'XIAOMI_API_KEY',
    label: 'Xiaomi MiMo',
    vendorDocUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    steps: [
      'Sign in to the Xiaomi MiMo console and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type XiaomiRole = 'system' | 'user' | 'assistant' | 'tool';

interface XiaomiMessage {
  role: XiaomiRole;
  content: string;
}

interface XiaomiChatResponse {
  model?: string;
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
