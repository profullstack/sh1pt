import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';
const DEFAULT_BASE = 'https://api.groq.com/openai';
export default defineAi({
  id: 'ai-groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile',
  models: ['llama-3.3-70b-versatile','llama-3.1-8b-instant','gemma2-9b-it'],
  async generate(ctx, prompt, opts) {
    const apiKey = ctx.secret('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY not in vault');
    const model = opts.model ?? 'llama-3.3-70b-versatile';
    ctx.log(`groq · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(`${DEFAULT_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}), ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}), ...opts.extra }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices: Array<{ message?: { content?: string } }>; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: data.choices[0]?.message?.content ?? '', model: data.model, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens };
  },
  setup: tokenSetup({ secretKey: 'GROQ_API_KEY', label: 'Groq', vendorDocUrl: 'https://console.groq.com/keys', steps: ['Open console.groq.com → API Keys → Create API Key', 'Copy the key (starts with gsk_…)', 'Paste below'] }),
});
