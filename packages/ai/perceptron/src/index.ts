import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.perceptron.inc/v1';
const DEFAULT_MODEL = 'perceptron-mk1';

export default defineAi<Config>({
  id: 'ai-perceptron',
  label: 'Perceptron',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'isaac-0.2-2b-preview',
    'isaac-0.2-1b',
    'isaac-0.1',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('PERCEPTRON_API_KEY');
    if (!apiKey) throw new Error('PERCEPTRON_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`perceptron · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: PerceptronMessage[] = [];
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
        ...(opts.maxTokens !== undefined ? { max_completion_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Perceptron ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as PerceptronChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'PERCEPTRON_API_KEY',
    label: 'Perceptron',
    vendorDocUrl: 'https://docs.perceptron.inc/api-reference/endpoint/chat-completions',
    steps: [
      'Sign in to Perceptron and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
    fields: [
      { key: 'baseUrl', message: 'Perceptron API base URL (optional):' },
    ],
  }),
});

type PerceptronRole = 'system' | 'user' | 'assistant';

interface PerceptronMessage {
  role: PerceptronRole;
  content: string;
}

interface PerceptronChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
