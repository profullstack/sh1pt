import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://llm.wavespeed.ai/v1';
const DEFAULT_MODEL = 'mancer/weaver';

export default defineAi<Config>({
  id: 'ai-mancer',
  label: 'Mancer (WaveSpeedAI)',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('MANCER_API_KEY');
    if (!apiKey) throw new Error('MANCER_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`mancer · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: MancerMessage[] = [];
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
    if (!res.ok) throw new Error(`Mancer ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as MancerChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MANCER_API_KEY',
    label: 'Mancer via WaveSpeedAI',
    vendorDocUrl: 'https://wavespeed.ai/llm/model/mancer/weaver',
    steps: [
      'Sign in at https://wavespeed.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type MancerRole = 'system' | 'user' | 'assistant' | 'tool';

interface MancerMessage {
  role: MancerRole;
  content: string;
}

interface MancerChatResponse {
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
