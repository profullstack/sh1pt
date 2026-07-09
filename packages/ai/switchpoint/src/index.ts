import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://llm.wavespeed.ai/v1';
const DEFAULT_MODEL = 'switchpoint/router';
const SECRET_KEY = 'SWITCHPOINT_API_KEY';

export default defineAi<Config>({
  id: 'ai-switchpoint',
  label: 'Switchpoint',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret(SECRET_KEY);
    if (!apiKey) throw new Error(`${SECRET_KEY} not in vault`);
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`switchpoint - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: SwitchpointMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE)}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: bearer(apiKey),
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
    if (!res.ok) throw new Error(`Switchpoint ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as SwitchpointChatResponse;
    const choice = data.choices[0];
    const text = choice?.message?.content ?? choice?.text ?? '';
    if (!text) throw new Error('Switchpoint response did not include generated text');
    return {
      text,
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Switchpoint',
    vendorDocUrl: 'https://wavespeed.ai/llm/model/switchpoint/router',
    steps: [
      'Create a WaveSpeedAI API key for the Switchpoint router endpoint',
      'Copy the key; it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function bearer(apiKey: string): string {
  return apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
}

type SwitchpointRole = 'system' | 'user' | 'assistant' | 'tool';

interface SwitchpointMessage {
  role: SwitchpointRole;
  content: string;
}

interface SwitchpointChatResponse {
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
