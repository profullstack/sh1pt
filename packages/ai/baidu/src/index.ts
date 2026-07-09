import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
  appId?: string;
}

const DEFAULT_BASE = 'https://qianfan.baidubce.com/v2';
const DEFAULT_MODEL = 'ernie-4.0-turbo-8k';

export default defineAi<Config>({
  id: 'ai-baidu',
  label: 'Baidu Qianfan',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'ernie-4.0-8k',
    'ernie-3.5-8k',
    'ernie-speed-8k',
    'deepseek-v3.1-250821',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('QIANFAN_API_KEY');
    if (!apiKey) throw new Error('QIANFAN_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`baidu-qianfan - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: QianfanMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    };
    if (config.appId) headers.appid = config.appId;

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Baidu Qianfan ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as QianfanChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'QIANFAN_API_KEY',
    label: 'Baidu Qianfan',
    vendorDocUrl: 'https://cloud.baidu.com/doc/qianfan-docs/s/Mm8r1mejk',
    steps: [
      'Create a Qianfan IAM Bearer token in Baidu Cloud',
      'Copy the bce-v3 token — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type QianfanRole = 'system' | 'user' | 'assistant' | 'tool';

interface QianfanMessage {
  role: QianfanRole;
  content: string;
}

interface QianfanChatResponse {
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
