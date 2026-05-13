import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.tokenfactory.nebius.com';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

export default defineAi<Config>({
  id: 'ai-nebius',
  label: 'Nebius Token Factory',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'deepseek-ai/DeepSeek-R1-0528',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('NEBIUS_API_KEY');
    if (!apiKey) throw new Error('NEBIUS_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`nebius · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: NebiusMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v1/chat/completions`, {
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
    if (!res.ok) throw new Error(`Nebius ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as NebiusChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'NEBIUS_API_KEY',
    label: 'Nebius Token Factory',
    vendorDocUrl: 'https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion',
    steps: [
      'Sign in at https://tokenfactory.nebius.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type NebiusRole = 'system' | 'user' | 'assistant' | 'tool';

interface NebiusMessage {
  role: NebiusRole;
  content: string;
}

interface NebiusChatResponse {
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
