import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.cohere.com';
const DEFAULT_MODEL = 'command-a-03-2025';

export default defineAi<Config>({
  id: 'ai-cohere',
  label: 'Cohere',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'command-a-reasoning-08-2025',
    'command-r7b-12-2024',
    'command-r-plus-08-2024',
    'command-r-08-2024',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('COHERE_API_KEY');
    if (!apiKey) throw new Error('COHERE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`cohere · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: CohereMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v2/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        stream: false,
        model,
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Cohere ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as CohereChatResponse;
    return {
      text: cohereText(data.message?.content),
      model: data.model ?? model,
      inputTokens: data.usage?.tokens?.input_tokens ?? data.usage?.billed_units?.input_tokens,
      outputTokens: data.usage?.tokens?.output_tokens ?? data.usage?.billed_units?.output_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'COHERE_API_KEY',
    label: 'Cohere',
    vendorDocUrl: 'https://docs.cohere.com/v2/reference/chat',
    steps: [
      'Sign in at https://dashboard.cohere.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type CohereRole = 'system' | 'user' | 'assistant' | 'tool';

interface CohereMessage {
  role: CohereRole;
  content: string;
}

interface CohereChatResponse {
  model?: string;
  message?: {
    content?: CohereContent;
  };
  usage?: {
    tokens?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    billed_units?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

type CohereContent = string | Array<{ type?: string; text?: string }> | undefined;

function cohereText(content: CohereContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part.type === undefined || part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
}
