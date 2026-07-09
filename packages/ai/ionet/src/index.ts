import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.intelligence.io.solutions/api/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

export default defineAi<Config>({
  id: 'ai-ionet',
  label: 'io.net',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'meta-llama/Llama-3.2-90B-Vision-Instruct',
    'Qwen/Qwen2-VL-7B-Instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('IOINTELLIGENCE_API_KEY');
    if (!apiKey) throw new Error('IOINTELLIGENCE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`ionet · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: IoNetMessage[] = [];
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
        stream: false,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`io.net ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as IoNetChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'IOINTELLIGENCE_API_KEY',
    label: 'io.net IO Intelligence',
    vendorDocUrl: 'https://io.net/docs/reference/ai-models/get-started-with-io-intelligence-api',
    steps: [
      'Sign in at https://io.net and open IO Intelligence API keys',
      'Create a secret key for the IO Intelligence project',
      'Copy the key; it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type IoNetRole = 'system' | 'user' | 'assistant' | 'tool';

interface IoNetMessage {
  role: IoNetRole;
  content: string;
}

interface IoNetChatResponse {
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
