import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.ai21.com';
const DEFAULT_MODEL = 'jamba-large';

export default defineAi<Config>({
  id: 'ai-ai21',
  label: 'AI21',
  defaultModel: DEFAULT_MODEL,
  models: ['jamba-large', 'jamba-mini', 'jamba-large-1.7', 'jamba-mini-2'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('AI21_API_KEY');
    if (!apiKey) throw new Error('AI21_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`ai21 · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Ai21Message[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/studio/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
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
    if (!res.ok) throw new Error(`AI21 ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as Ai21ChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AI21_API_KEY',
    label: 'AI21',
    vendorDocUrl: 'https://docs.ai21.com/reference/jamba-1-6-api-ref',
    steps: [
      'Sign in at https://studio.ai21.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type Ai21Role = 'system' | 'user' | 'assistant' | 'tool';

interface Ai21Message {
  role: Ai21Role;
  content: string;
}

interface Ai21ChatResponse {
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
