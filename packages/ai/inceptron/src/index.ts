import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.inceptron.io/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

export default defineAi<Config>({
  id: 'ai-inceptron',
  label: 'Inceptron',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'meta-llama/Llama-3.1-8B-Instruct',
    'meta-llama/Llama-3.2-1B-Instruct',
    'google/gemma-3-27b-it',
    'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    'Qwen/Qwen3-VL-235B-A22B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'openai/gpt-oss-20b',
    'deepseek-ai/DeepSeek-R1-0528',
    'deepseek-ai/DeepSeek-V3-0324',
    'deepseek-ai/DeepSeek-V3.1',
    'moonshotai/Kimi-K2-Thinking',
    'zai-org/GLM-4.6',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('INCEPTRON_API_KEY');
    if (!apiKey) throw new Error('INCEPTRON_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`inceptron · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: InceptronMessage[] = [];
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
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Inceptron ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as InceptronChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'INCEPTRON_API_KEY',
    label: 'Inceptron',
    vendorDocUrl: 'https://docs.inceptron.io/API%20Reference/chat-completions',
    steps: [
      'Sign in to the Inceptron console and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type InceptronRole = 'system' | 'user' | 'assistant' | 'tool';

interface InceptronMessage {
  role: InceptronRole;
  content: string;
}

interface InceptronChatResponse {
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
