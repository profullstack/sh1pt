import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.z.ai/api/paas/v4';
const DEFAULT_MODEL = 'glm-5.1';

export default defineAi<Config>({
  id: 'ai-zai',
  label: 'Z.ai',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'glm-5-turbo',
    'glm-5',
    'glm-4.7',
    'glm-4.7-flash',
    'glm-4.6',
    'glm-4.5',
    'glm-4.5-air',
    'glm-4.5-flash',
    'glm-4-32b-0414-128k',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('ZAI_API_KEY');
    if (!apiKey) throw new Error('ZAI_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`zai · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: ZaiMessage[] = [];
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
    if (!res.ok) throw new Error(`Z.ai ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as ZaiChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'ZAI_API_KEY',
    label: 'Z.ai',
    vendorDocUrl: 'https://docs.z.ai/api-reference/llm/chat-completion',
    steps: [
      'Sign in at https://z.ai and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type ZaiRole = 'system' | 'user' | 'assistant' | 'tool';

interface ZaiMessage {
  role: ZaiRole;
  content: string;
}

interface ZaiChatResponse {
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
