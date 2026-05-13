import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://inference.baseten.co/v1';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3.1';

export default defineAi<Config>({
  id: 'ai-baseten',
  label: 'Baseten',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'deepseek-ai/DeepSeek-V3-0324',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('BASETEN_API_KEY');
    if (!apiKey) throw new Error('BASETEN_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`baseten · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: BasetenMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Api-Key ${apiKey}`,
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
    if (!res.ok) throw new Error(`Baseten ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as BasetenChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'BASETEN_API_KEY',
    label: 'Baseten',
    vendorDocUrl: 'https://docs.baseten.co/reference/inference-api/chat-completions',
    steps: [
      'Sign in at https://www.baseten.co and create an API key',
      'Enable the Model API or configure a deployed model endpoint if needed',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type BasetenRole = 'system' | 'user' | 'assistant' | 'tool';

interface BasetenMessage {
  role: BasetenRole;
  content: string;
}

interface BasetenChatResponse {
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
