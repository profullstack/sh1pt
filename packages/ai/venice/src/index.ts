import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.venice.ai/api";

function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export default defineAi<Config>({
  id: "ai-venice",
  label: "Venice AI",
  defaultModel: "llama-3.3-70b",
  models: ["llama-3.3-70b", "qwen3-235b", "dolphin-2.9.2-qwen2-72b"],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret("VENICE_API_KEY");
    if (!apiKey) throw new Error('VENICE_API_KEY not in vault - run `sh1pt promote ai setup`');
    const model = opts.model ?? "llama-3.3-70b";
    ctx.log(`ai-venice · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(chatCompletionsUrl(config.baseUrl ?? DEFAULT_BASE), {
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
    if (!res.ok) throw new Error(`Venice AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: "VENICE_API_KEY",
    label: "Venice AI",
    vendorDocUrl: "https://docs.venice.ai/api-reference/api-spec",
    steps: ["Sign in at https://venice.ai and create an API key", "Copy the key - usually shown once", "Paste below; sh1pt encrypts it in the vault"],
    fields: [
      { key: 'baseUrl', message: 'OpenAI-compatible base URL (optional; leave blank for the default):' },
    ],
  }),
});
