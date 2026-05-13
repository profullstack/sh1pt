import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k2.6';

export default defineAi<Config>({
  id: 'ai-moonshot',
  label: 'Moonshot AI',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-turbo-preview'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('MOONSHOT_API_KEY');
    if (!apiKey) throw new Error('MOONSHOT_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`moonshot · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: MoonshotMessage[] = [];
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
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Moonshot ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as MoonshotChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MOONSHOT_API_KEY',
    label: 'Moonshot AI',
    vendorDocUrl: 'https://platform.kimi.ai/docs/api/chat',
    steps: [
      'Sign in at https://platform.moonshot.ai/console/api-keys and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type MoonshotRole = 'system' | 'user' | 'assistant' | 'tool';

interface MoonshotMessage {
  role: MoonshotRole;
  content: string;
}

interface MoonshotChatResponse {
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
