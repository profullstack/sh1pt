import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';
const DEFAULT_BASE = 'https://api.x.ai';
export default defineAi({
  id: 'ai-xai', label: 'xAI (Grok)', defaultModel: 'grok-3',
  models: ['grok-3','grok-3-mini','grok-2'],
  async generate(ctx, prompt, opts) {
    const apiKey = ctx.secret('XAI_API_KEY');
    if (!apiKey) throw new Error('XAI_API_KEY not in vault');
    const model = opts.model ?? 'grok-3';
    ctx.log(`xai · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(`${DEFAULT_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}), ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}), ...opts.extra }),
    });
    if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices: Array<{ message?: { content?: string } }>; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: data.choices[0]?.message?.content ?? '', model: data.model, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens };
  },
  setup: tokenSetup({ secretKey: 'XAI_API_KEY', label: 'xAI (Grok)', vendorDocUrl: 'https://console.x.ai', steps: ['Open console.x.ai → API Keys', 'Copy the key (starts with xai-…)', 'Paste below'] }),
});
