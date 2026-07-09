import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.mistral.ai';

function chatCompletionsUrl(baseUrl?: string): string {
  return `${(baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')}/v1/chat/completions`;
}

function redact(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[redacted]') : value;
}

export default defineAi<Config>({
  id: 'ai-mistral',
  label: 'Mistral',
  defaultModel: 'mistral-large-latest',
  models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest', 'ministral-8b-latest'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('MISTRAL_API_KEY');
    if (!apiKey) throw new Error('MISTRAL_API_KEY not in vault');
    const model = opts.model ?? 'mistral-large-latest';
    ctx.log(`mistral · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Mistral ${res.status}: ${redact(await res.text(), apiKey).slice(0, 200)}`);
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
    secretKey: 'MISTRAL_API_KEY',
    label: 'Mistral',
    vendorDocUrl: 'https://console.mistral.ai',
    steps: [
      'Sign in at https://console.mistral.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
