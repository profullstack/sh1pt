import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.reka.ai';
const DEFAULT_MODEL = 'reka-flash';

export default defineAi<Config>({
  id: 'ai-reka',
  label: 'Reka AI',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'reka-edge', 'reka-edge-2603'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('REKA_API_KEY');
    if (!apiKey) throw new Error('REKA_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`reka · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: RekaMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        stream: false,
        model,
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Reka ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as RekaChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'REKA_API_KEY',
    label: 'Reka AI',
    vendorDocUrl: 'https://docs.reka.ai/chat/api-reference/create',
    steps: [
      'Sign in at https://platform.reka.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type RekaRole = 'system' | 'user' | 'assistant' | 'tool';

interface RekaMessage {
  role: RekaRole;
  content: string;
}

interface RekaChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}
