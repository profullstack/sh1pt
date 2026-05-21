import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.sambanova.ai/v1';
const DEFAULT_MODEL = 'gpt-oss-120b';

export default defineAi<Config>({
  id: 'ai-sambanova',
  label: 'SambaNova',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'Meta-Llama-3.3-70B-Instruct',
    'Meta-Llama-3.1-8B-Instruct',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('SAMBANOVA_API_KEY');
    if (!apiKey) throw new Error('SAMBANOVA_API_KEY not in vault - run `sh1pt promote ai setup`');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`sambanova - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: SambaNovaMessage[] = [];
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
      throw new Error(`SambaNova ${res.status}: ${excerpt}`);
    }

    const data = await res.json() as SambaNovaChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'SAMBANOVA_API_KEY',
    label: 'SambaNova',
    vendorDocUrl: 'https://docs.sambanova.ai/docs/api-reference/chat-completions/create-chat-based-completion',
    steps: [
      'Sign in at https://cloud.sambanova.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type SambaNovaRole = 'system' | 'user' | 'assistant' | 'tool';

interface SambaNovaMessage {
  role: SambaNovaRole;
  content: string;
}

interface SambaNovaChatResponse {
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
