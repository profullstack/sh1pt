import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.aionlabs.ai/v1';
const DEFAULT_MODEL = 'aion-1.0-mini';

export default defineAi<Config>({
  id: 'ai-aionlabs',
  label: 'AionLabs',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'aion-labs/aion-2.0'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('AIONLABS_API_KEY');
    if (!apiKey) throw new Error('AIONLABS_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`aionlabs · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: AionLabsMessage[] = [];
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
    if (!res.ok) throw new Error(`AionLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as AionLabsChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AIONLABS_API_KEY',
    label: 'AionLabs',
    vendorDocUrl: 'https://www.aionlabs.ai/docs/quickstart/',
    steps: [
      'Sign in at https://www.aionlabs.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type AionLabsRole = 'system' | 'user' | 'assistant' | 'tool';

interface AionLabsMessage {
  role: AionLabsRole;
  content: string;
}

interface AionLabsChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
      reasoning?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
