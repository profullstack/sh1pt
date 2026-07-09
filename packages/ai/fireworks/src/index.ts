import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.fireworks.ai/inference/v1';
const DEFAULT_MODEL = 'accounts/fireworks/models/llama-v3p3-70b-instruct';

export default defineAi<Config>({
  id: 'ai-fireworks',
  label: 'Fireworks AI',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('FIREWORKS_API_KEY');
    if (!apiKey) throw new Error('FIREWORKS_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`fireworks · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: FireworksMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
    if (!res.ok) {
      const excerpt = redact((await res.text()).slice(0, 200), apiKey);
      throw new Error(`Fireworks AI ${res.status}: ${excerpt}`);
    }

    const data = await res.json() as FireworksChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'FIREWORKS_API_KEY',
    label: 'Fireworks AI',
    vendorDocUrl: 'https://docs.fireworks.ai/api-reference/post-chatcompletions',
    steps: [
      'Sign in at https://fireworks.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type FireworksRole = 'system' | 'user' | 'assistant' | 'tool';

interface FireworksMessage {
  role: FireworksRole;
  content: string;
}

interface FireworksChatResponse {
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

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}
