import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.novita.ai/openai";

function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export default defineAi<Config>({
  id: "ai-novita",
  label: "NovitaAI",
  defaultModel: "meta-llama/llama-3.3-70b-instruct",
  models: ["meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-v3-0324", "qwen/qwen3-235b-a22b-fp8"],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret("NOVITA_API_KEY");
    if (!apiKey) throw new Error('NOVITA_API_KEY not in vault - run `sh1pt promote ai setup`');
    const model = opts.model ?? "meta-llama/llama-3.3-70b-instruct";
    ctx.log(`ai-novita · model=${model} · ${prompt.length} chars in`);
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
    if (!res.ok) throw new Error(`NovitaAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    secretKey: "NOVITA_API_KEY",
    label: "NovitaAI",
    vendorDocUrl: "https://novita.ai/docs/api-reference/model-apis-llm-create-chat-completion",
    steps: ["Sign in at https://novita.ai and create an API key", "Copy the key - usually shown once", "Paste below; sh1pt encrypts it in the vault"],
    fields: [
      { key: 'baseUrl', message: 'OpenAI-compatible base URL (optional; leave blank for the default):' },
    ],
  }),
});
