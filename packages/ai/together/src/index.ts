import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.together.ai/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

export default defineAi<Config>({
  id: 'ai-together',
  label: 'Together AI',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'Qwen/Qwen3.5-9B',
    'deepseek-ai/DeepSeek-V3',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('TOGETHER_API_KEY');
    if (!apiKey) throw new Error('TOGETHER_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`together · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: TogetherMessage[] = [];
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
    if (!res.ok) throw new Error(`Together AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as TogetherChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'TOGETHER_API_KEY',
    label: 'Together AI',
    vendorDocUrl: 'https://docs.together.ai/reference/chat-completions',
    steps: [
      'Sign in at https://api.together.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type TogetherRole = 'system' | 'user' | 'assistant' | 'tool';

interface TogetherMessage {
  role: TogetherRole;
  content: string;
}

interface TogetherChatResponse {
  model?: string;
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
