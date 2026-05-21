import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// Anthropic Messages API. Distinct from `agent-claude` (wraps the
// `claude` CLI binary) — this hits the HTTP endpoint with an API key
// for one-shot generation of ad copy / social bodies / taglines.
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export default defineAi<Config>({
  id: 'ai-claude',
  label: 'Claude (Anthropic API)',
  defaultModel: 'claude-opus-4-7',
  models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not in vault');
    const model = opts.model ?? 'claude-opus-4-7';
    ctx.log(`claude · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        messages: [{ role: 'user', content: prompt }],
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${redact((await res.text()).slice(0, 200), apiKey)}`);
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    return {
      text,
      model: data.model,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  },

  setup: tokenSetup({
    secretKey: 'ANTHROPIC_API_KEY',
    label: 'Claude (Anthropic)',
    vendorDocUrl: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Open console.anthropic.com → API Keys → Create Key',
      'Copy the key (starts with sk-ant-…) — shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

function redact(value: string, apiKey: string): string {
  return value
    .replaceAll(apiKey, '[redacted]')
    .replace(/sk-ant-[A-Za-z0-9._~+/=-]{12,}/g, '[redacted]');
}
