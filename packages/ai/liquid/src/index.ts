import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_MODEL = 'LiquidAI/LFM2-8B-A1B';
const PRIMARY_SECRET_KEY = 'FAL_API_KEY';
const LEGACY_SECRET_KEY = 'LIQUID_API_KEY';

export default defineAi<Config>({
  id: 'ai-liquid',
  label: 'Liquid AI',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret(PRIMARY_SECRET_KEY) ?? ctx.secret(LEGACY_SECRET_KEY);
    if (!apiKey) throw new Error('FAL_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`liquid · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const baseUrl = config.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error('Liquid AI Fal baseUrl is required; use your deployment /v1 URL');
    }

    const messages: LiquidMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Key ${apiKey}`,
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
    if (!res.ok) throw new Error(`Liquid AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as LiquidChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: PRIMARY_SECRET_KEY,
    label: 'Liquid AI',
    vendorDocUrl: 'https://docs.liquid.ai/deployment/gpu-inference/fal',
    steps: [
      'Deploy Liquid LFM on Fal and copy the deployment /v1 base URL',
      'Create a Fal API key for the private deployment',
      'Use the deployment /v1 URL as baseUrl',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type LiquidRole = 'system' | 'user' | 'assistant' | 'tool';

interface LiquidMessage {
  role: LiquidRole;
  content: string;
}

interface LiquidChatResponse {
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
