import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.siliconflow.com/v1';
const DEFAULT_MODEL = 'Qwen/QwQ-32B';

export default defineAi<Config>({
  id: 'ai-siliconflow',
  label: 'SiliconFlow',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'deepseek-ai/DeepSeek-V3.2',
    'zai-org/GLM-4.7',
    'moonshotai/Kimi-K2.5',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('SILICONFLOW_API_KEY');
    if (!apiKey) throw new Error('SILICONFLOW_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`siliconflow · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: SiliconFlowMessage[] = [];
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
    if (!res.ok) throw new Error(`SiliconFlow ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as SiliconFlowChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'SILICONFLOW_API_KEY',
    label: 'SiliconFlow',
    vendorDocUrl: 'https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions',
    steps: [
      'Sign in at https://cloud.siliconflow.com/account/ak and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type SiliconFlowRole = 'system' | 'user' | 'assistant' | 'tool';

interface SiliconFlowMessage {
  role: SiliconFlowRole;
  content: string;
}

interface SiliconFlowChatResponse {
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
