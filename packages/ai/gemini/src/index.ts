import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

// Google Gemini via the Generative Language API (AI Studio key path —
// not Vertex). Vertex requires GCP service-account auth; AI Studio keys
// are static tokens that work for prototyping and small-scale prod.
interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';

export default defineAi<Config>({
  id: 'ai-gemini',
  label: 'Gemini (Google AI Studio)',
  defaultModel: 'gemini-1.5-pro',
  models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-thinking-exp'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not in vault');
    const model = opts.model ?? 'gemini-1.5-pro';
    ctx.log(`gemini · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const url = `${config.baseUrl ?? DEFAULT_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const generationConfig: Record<string, unknown> = {};
    if (opts.maxTokens !== undefined) generationConfig.maxOutputTokens = opts.maxTokens;
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      model,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  },

  setup: tokenSetup({
    secretKey: 'GEMINI_API_KEY',
    label: 'Gemini (Google AI Studio)',
    vendorDocUrl: 'https://aistudio.google.com/app/apikey',
    steps: [
      'Open aistudio.google.com/app/apikey → Create API key',
      'Copy the key',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
