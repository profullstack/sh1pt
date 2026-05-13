import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.stepfun.ai/v1';
const DEFAULT_MODEL = 'step-3.5-flash';

export default defineAi<Config>({
  id: 'ai-stepfun',
  label: 'StepFun',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'step-3.5-flash-2603',
    'step-3',
    'step-2-mini',
    'step-2-16k',
    'step-2-16k-exp',
    'step-1-8k',
    'step-1-32k',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('STEPFUN_API_KEY');
    if (!apiKey) throw new Error('STEPFUN_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`stepfun · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: StepFunMessage[] = [];
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
    if (!res.ok) throw new Error(`StepFun ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as StepFunChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'STEPFUN_API_KEY',
    label: 'StepFun',
    vendorDocUrl: 'https://platform.stepfun.ai/docs/en/api-reference/chat/chat-completion-create',
    steps: [
      'Sign in at https://platform.stepfun.ai and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type StepFunRole = 'system' | 'user' | 'assistant' | 'tool';

interface StepFunMessage {
  role: StepFunRole;
  content: string;
}

interface StepFunChatResponse {
  model: string;
  choices: Array<{
    message?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
