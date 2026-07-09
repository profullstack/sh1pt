import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://chatapi.akash.network/api/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

export default defineAi<Config>({
  id: 'ai-akashml',
  label: 'Akash ML',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'deepseek-ai/DeepSeek-V4-Flash',
    'Qwen/Qwen3.6-35B-A3B',
    'moonshotai/Kimi-K2.6',
    'MiniMaxAI/MiniMax-M2.5',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('AKASH_API_KEY');
    if (!apiKey) throw new Error('AKASH_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`akashml - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: AkashMessage[] = [];
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
    if (!res.ok) throw new Error(`Akash ML ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as AkashChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AKASH_API_KEY',
    label: 'Akash ML',
    vendorDocUrl: 'https://chatapi.akash.network/documentation',
    steps: [
      'Sign in at https://chatapi.akash.network or https://akashml.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type AkashRole = 'system' | 'user' | 'assistant' | 'tool';

interface AkashMessage {
  role: AkashRole;
  content: string;
}

interface AkashChatResponse {
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
