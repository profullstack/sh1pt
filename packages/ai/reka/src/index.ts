import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.reka.ai';

function cleanBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return DEFAULT_BASE;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Reka baseUrl must be a valid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Reka baseUrl must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Reka baseUrl must not include credentials');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Reka baseUrl must not include query strings or fragments');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl?: string): string {
  return `${cleanBaseUrl(baseUrl)}/v1/chat/completions`;
}

function redact(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[redacted]') : value;
}

export default defineAi<Config>({
  id: 'ai-reka',
  label: 'Reka AI',
  defaultModel: 'reka-core',
  models: ['reka-core', 'reka-core-vision'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('REKA_API_KEY');
    if (!apiKey) throw new Error('REKA_API_KEY not in vault');
    const model = opts.model ?? 'reka-core';
    ctx.log(`reka · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`Reka ${res.status}: ${redact(await res.text(), apiKey).slice(0, 200)}`);
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
    secretKey: 'REKA_API_KEY',
    label: 'Reka AI',
    vendorDocUrl: 'https://docs.reka.ai',
    steps: [
      'Sign in at https://www.reka.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
