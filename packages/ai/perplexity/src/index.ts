import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.perplexity.ai';
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export default defineAi<Config>({
  id: 'ai-perplexity',
  label: 'Perplexity',
  defaultModel: 'sonar-pro',
  models: [
    'sonar',
    'sonar-pro',
    'sonar-reasoning-pro',
    'sonar-deep-research',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('PERPLEXITY_API_KEY');
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY not in vault');
    const model = opts.model ?? 'sonar-pro';
    ctx.log(`perplexity · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const baseUrl = trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE);
    const res = await fetch(`${baseUrl}/v1/sonar`, {
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
    if (!res.ok) throw new Error(`Perplexity ${res.status}: ${redact((await res.text()).slice(0, 200), apiKey)}`);
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
    secretKey: 'PERPLEXITY_API_KEY',
    label: 'Perplexity',
    vendorDocUrl: 'https://www.perplexity.ai/settings/api',
    steps: [
      'Sign in at https://www.perplexity.ai/settings/api and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

function redact(value: string, apiKey: string): string {
  return value
    .replaceAll(apiKey, '[redacted]')
    .replace(/pplx-[A-Za-z0-9._~+/=-]{12,}/g, '[redacted]');
}
