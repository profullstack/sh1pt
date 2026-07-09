import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.totalgpt.ai';
const DEFAULT_MODEL = 'Sao10K-72B-Qwen2.5-Kunou-v1-FP8-Dynamic';

export default defineAi<Config>({
  id: 'ai-infermatic',
  label: 'Infermatic',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'Sao10K-L3.3-70B-Euryale-v2.3-FP8-Dynamic',
    'TheDrummer-UnslopNemo-12B-v4.1',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('INFERMATIC_API_KEY');
    if (!apiKey) throw new Error('INFERMATIC_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`infermatic · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: InfermaticMessage[] = [];
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
    if (!res.ok) throw new Error(`Infermatic ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as InfermaticChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'INFERMATIC_API_KEY',
    label: 'Infermatic',
    vendorDocUrl: 'https://ui.infermatic.ai/docs',
    steps: [
      'Sign in at https://ui.infermatic.ai and create an API key',
      'Copy the key; it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type InfermaticRole = 'system' | 'user' | 'assistant' | 'tool';

interface InfermaticMessage {
  role: InfermaticRole;
  content: string;
}

interface InfermaticChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
