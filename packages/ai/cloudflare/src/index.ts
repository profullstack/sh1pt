import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.cloudflare.com/client/v4';

export default defineAi<Config>({
  id: 'ai-cloudflare',
  label: 'Cloudflare Workers AI',
  defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  models: [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/qwen/qwen1.5-14b-chat-awq',
    '@cf/mistral/mistral-7b-instruct-v0.2-lora',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('CLOUDFLARE_API_TOKEN');
    if (!apiKey) throw new Error('CLOUDFLARE_API_TOKEN not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    ctx.log(`cloudflare · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };
    if (!config.accountId) throw new Error('Cloudflare accountId config required');

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const apiBase = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    const res = await fetch(`${apiBase}/accounts/${config.accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Cloudflare Workers AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: {
        response?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
    };
    if (data.success === false) {
      const detail = data.errors?.map((error) => error.message).filter(Boolean).join('; ') || 'request failed';
      throw new Error(`Cloudflare Workers AI: ${detail}`);
    }
    return {
      text: data.result?.response ?? '',
      model,
      inputTokens: data.result?.usage?.prompt_tokens,
      outputTokens: data.result?.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLOUDFLARE_API_TOKEN',
    label: 'Cloudflare Workers AI',
    vendorDocUrl: 'https://developers.cloudflare.com/workers-ai/get-started/rest-api/',
    steps: [
      'Open dash.cloudflare.com → Workers AI → Use REST API',
      'Create a Workers AI API token and copy the token',
      'Copy the account ID shown beside the REST API instructions',
      'Paste below; sh1pt encrypts the token in the vault',
    ],
    fields: [
      { key: 'accountId', message: 'Cloudflare account ID:', required: true },
      { key: 'baseUrl', message: 'Cloudflare API base URL (optional):' },
    ],
  }),
});
