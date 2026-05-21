import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M2.7';

export default defineAi<Config>({
  id: 'ai-minimax',
  label: 'MiniMax',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('MINIMAX_API_KEY');
    if (!apiKey) throw new Error('MINIMAX_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`minimax · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: MiniMaxMessage[] = [];
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
        ...(opts.maxTokens !== undefined ? { max_completion_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`MiniMax ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as MiniMaxChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MINIMAX_API_KEY',
    label: 'MiniMax',
    vendorDocUrl: 'https://platform.minimax.io/docs/api-reference/text-openai-api',
    steps: [
      'Sign in at https://platform.minimax.io and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type MiniMaxRole = 'system' | 'user' | 'assistant' | 'tool';

interface MiniMaxMessage {
  role: MiniMaxRole;
  content: string;
}

interface MiniMaxChatResponse {
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
