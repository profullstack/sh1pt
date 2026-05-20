import { defineAi, tokenSetup, type AiGenerateOpts } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
  workspaceId?: string;
}

const DEFAULT_BASE_URL = 'https://api.inflection.ai/external/api';
const DEFAULT_MODEL = 'inflection_3_productivity';
const MODELS = ['inflection_3_productivity', 'inflection_3_pi', 'Pi-3.1'];
const SECRET_KEY = 'INFLECTION_API_KEY';

export default defineAi<Config>({
  id: 'ai-inflection',
  label: 'Inflection',
  defaultModel: DEFAULT_MODEL,
  models: MODELS,

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret(SECRET_KEY);
    if (!apiKey) throw new Error(`${SECRET_KEY} not in vault`);
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`inflection · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const res = await fetch(inferenceUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        authorization: authorizationHeader(apiKey),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(buildRequest(prompt, opts, config, model)),
    });

    if (!res.ok) throw new Error(`Inflection ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as InflectionResponse;
    return {
      text: extractText(data),
      model: extractModel(data, model),
      inputTokens: pickNumber(data.usage, 'prompt_tokens', 'input_tokens', 'inputTokens'),
      outputTokens: pickNumber(data.usage, 'completion_tokens', 'output_tokens', 'outputTokens'),
    };
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Inflection',
    vendorDocUrl: 'https://developers.inflection.ai/docs/api-reference',
    steps: [
      'Sign in at https://developers.inflection.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

function inferenceUrl(baseUrl = DEFAULT_BASE_URL): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/inference') ? trimmed : `${trimmed}/inference`;
}

function authorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

function buildRequest(
  prompt: string,
  opts: AiGenerateOpts,
  config: Config,
  model: string,
): Record<string, unknown> {
  const context: InflectionContextItem[] = [];
  if (opts.system) context.push({ type: 'Instruction', text: opts.system });
  context.push({ type: 'Human', text: prompt });

  return {
    config: model,
    context,
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(config.workspaceId ? { workspace_id: config.workspaceId } : {}),
    ...opts.extra,
  };
}

interface InflectionContextItem {
  type: 'Instruction' | 'Human';
  text: string;
}

interface InflectionResponse {
  model?: string;
  config?: string;
  text?: string;
  response?: string;
  output?: string;
  message?: string;
  completion?: string;
  usage?: Record<string, unknown>;
  choices?: Array<{
    text?: string;
    messages?: string;
    message?: {
      content?: string;
    };
  }>;
  result?: {
    text?: string;
    output?: string;
    response?: string;
  };
  data?: {
    text?: string;
    output?: string;
    response?: string;
  };
  outputs?: Array<{
    text?: string;
    output?: string;
  }>;
}

function extractText(data: InflectionResponse): string {
  const candidates = [
    data.text,
    data.response,
    data.output,
    data.message,
    data.completion,
    data.result?.text,
    data.result?.output,
    data.result?.response,
    data.data?.text,
    data.data?.output,
    data.data?.response,
    data.outputs?.[0]?.text,
    data.outputs?.[0]?.output,
    data.choices?.[0]?.message?.content,
    data.choices?.[0]?.text,
    data.choices?.[0]?.messages,
  ];

  const text = candidates.find((candidate): candidate is string => typeof candidate === 'string');
  if (!text) throw new Error('Inflection response did not include generated text');
  return text;
}

function extractModel(data: InflectionResponse, fallback: string): string {
  return data.model ?? data.config ?? fallback;
}

function pickNumber(source: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}
