import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.nextbit256.com/v1';
const DEFAULT_MODEL = 'llama3.3:70b';

export default defineAi<Config>({
  id: 'ai-nextbit',
  label: 'NextBit',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'qwen2.5:72b', 'deepseek:qwen3-r1-32b', 'qwen3:30b', 'qwen3:14b'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('NEXTBIT_API_KEY');
    if (!apiKey) throw new Error('NEXTBIT_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`nextbit · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: NextBitMessage[] = [];
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
    if (!res.ok) throw new Error(`NextBit ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as NextBitChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'NEXTBIT_API_KEY',
    label: 'NextBit',
    vendorDocUrl: 'https://www.nextbit256.com/docs/quickstart',
    steps: [
      'Sign in at https://www.nextbit256.com and open the API Keys dashboard',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type NextBitRole = 'system' | 'user' | 'assistant' | 'tool';

interface NextBitMessage {
  role: NextBitRole;
  content: string;
}

interface NextBitChatResponse {
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
