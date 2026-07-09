import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
  project?: string;
  location?: string;
  publisher?: string;
}

const DEFAULT_BASE = 'https://aiplatform.googleapis.com/v1';
const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_MODEL = 'gemini-1.5-pro';
const DEFAULT_PUBLISHER = 'google';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export default defineAi<Config>({
  id: 'ai-google-vertex',
  label: 'Google Vertex AI',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('GOOGLE_VERTEX_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_VERTEX_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`google vertex · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const generationConfig: Record<string, unknown> = {};
    if (opts.maxTokens !== undefined) generationConfig.maxOutputTokens = opts.maxTokens;
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;

    const res = await fetch(buildGenerateContentUrl(apiKey, model, config), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Google Vertex AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as VertexGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return {
      text,
      model,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GOOGLE_VERTEX_API_KEY',
    label: 'Google Vertex AI',
    vendorDocUrl: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/vertex-ai-express-mode-api-reference',
    steps: [
      'Create a Vertex AI express mode API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
    fields: [
      { key: 'baseUrl', message: 'Vertex AI REST base URL (default: https://aiplatform.googleapis.com/v1):' },
      { key: 'project', message: 'Optional Google Cloud project id for standard Vertex endpoints:' },
      { key: 'location', message: 'Optional Vertex location for standard endpoints (default: us-central1):' },
      { key: 'publisher', message: 'Optional publisher id (default: google):' },
    ],
  }),
});

function buildGenerateContentUrl(apiKey: string, model: string, config: Config): string {
  const baseUrl = trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE);
  const modelPath = model.includes('/')
    ? model
    : config.project
      ? `projects/${config.project}/locations/${config.location ?? DEFAULT_LOCATION}/publishers/${config.publisher ?? DEFAULT_PUBLISHER}/models/${model}`
      : `publishers/${config.publisher ?? DEFAULT_PUBLISHER}/models/${model}`;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}/${modelPath}:generateContent${separator}key=${encodeURIComponent(apiKey)}`;
}

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}
