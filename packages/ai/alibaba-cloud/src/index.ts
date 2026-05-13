import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-plus';

export default defineAi<Config>({
  id: 'ai-alibaba-cloud',
  label: 'Alibaba Cloud Model Studio',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'qwen3.5-plus',
    'qwen3.5-flash',
    'qwen3-max',
    'qwen-flash',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('DASHSCOPE_API_KEY');
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`alibaba-cloud · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: AlibabaCloudMessage[] = [];
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
    if (!res.ok) {
      throw new Error(`Alibaba Cloud ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json() as AlibabaCloudChatResponse;
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'DASHSCOPE_API_KEY',
    label: 'Alibaba Cloud Model Studio',
    vendorDocUrl: 'https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen',
    steps: [
      'Sign in to Alibaba Cloud Model Studio and create a DashScope API key',
      'Use the deployment region that matches your key; the default base URL uses Singapore',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type AlibabaCloudRole = 'system' | 'user' | 'assistant' | 'tool';

interface AlibabaCloudMessage {
  role: AlibabaCloudRole;
  content: string;
}

interface AlibabaCloudChatResponse {
  model: string;
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
