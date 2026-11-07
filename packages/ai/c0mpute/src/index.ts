import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://infernetprotocol.com';
const DEFAULT_MODEL = 'huihui_ai/qwen3.5-abliterated:9b';

function redact(value: string, apiKey: string): string {
  return apiKey ? value.split(apiKey).join('[redacted]') : value;
}

export default defineAi<Config>({
  id: 'ai-c0mpute',
  label: 'c0mpute',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL, 'huihui_ai/qwen3.5-abliterated:4b'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('C0MPUTE_API_KEY');
    if (!apiKey) throw new Error('C0MPUTE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`c0mpute · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        // Peer nodes only, never Infernet's billed hosted fallback.
        p2p_only: true,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
      // A job on the peer network can take a minute or more.
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`c0mpute ${res.status}: ${redact(await res.text(), apiKey).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      model: string;
    };
    // c0mpute reports no token counts.
    return { text: data.choices[0]?.message?.content ?? '', model: data.model };
  },

  setup: tokenSetup<Config>({
    secretKey: 'C0MPUTE_API_KEY',
    label: 'c0mpute',
    vendorDocUrl: 'https://infernetprotocol.com',
    steps: [
      'Sign in at https://infernetprotocol.com and create an account API key (ik_live_)',
      'Copy the key, it is usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
