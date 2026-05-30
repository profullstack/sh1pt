import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.groq.com/openai';

function chatCompletionsUrl(baseUrl?: string): string {
  return `${(baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')}/v1/chat/completions`;
}

function redact(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[redacted]') : value;
}

export default defineAi<Config>({
  id: 'ai-groq',
  label: 'Groq',
  defaultModel: 'llama-3.3-70b-versatile',
  models: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'deepseek-r1-distill-llama-70b',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY not in vault');
    const model = opts.model ?? 'llama-3.3-70b-versatile';
    ctx.log(`groq · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(chatCompletionsUrl(config.baseUrl), {
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
    if (!res.ok) throw new Error(`Groq ${res.status}: ${redact(await res.text(), apiKey).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      model: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GROQ_API_KEY',
    label: 'Groq',
    vendorDocUrl: 'https://console.groq.com',
    steps: [
      'Sign in at https://console.groq.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
