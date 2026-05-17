import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// OpenAI Chat Completions. Compatible with any OpenAI-protocol server
// (Groq, Together, vLLM) via baseUrl override — though provider-specific
// adapters are usually a better fit when limits/pricing differ.
interface Config {
  baseUrl?: string;
  organization?: string;
}

const DEFAULT_BASE = 'https://api.openai.com';

export default defineAi<Config>({
  id: 'ai-openai',
  label: 'OpenAI (GPT)',
  defaultModel: 'gpt-4o',
  models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not in vault');
    const model = opts.model ?? 'gpt-4o';
    ctx.log(`openai · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    };
    if (config.organization) headers['openai-organization'] = config.organization;

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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

  setup: tokenSetup({
    secretKey: 'OPENAI_API_KEY',
    label: 'OpenAI',
    vendorDocUrl: 'https://platform.openai.com/api-keys',
    steps: [
      'Open platform.openai.com → API Keys → Create new secret key',
      'Copy the key (starts with sk-…) — shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
    fields: [
      { key: 'organization', message: 'Organization id (optional, leave blank if you only have one):' },
    ],
  }),
});
