import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.clarifai.com/v2/ext/openai/v1';
const DEFAULT_MODEL = 'https://clarifai.com/openai/chat-completion/models/gpt-oss-120b';

export default defineAi<Config>({
  id: 'ai-clarifai',
  label: 'Clarifai',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'openai/chat-completion/models/gpt-oss-120b',
    'anthropic/completion/models/claude-sonnet-4',
    'https://clarifai.com/openai/chat-completion/models/gpt-4o',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('CLARIFAI_PAT');
    if (!apiKey) throw new Error('CLARIFAI_PAT not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`clarifai - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: ClarifaiMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Key ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.maxTokens !== undefined ? { max_completion_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`Clarifai ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as ClarifaiChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'CLARIFAI_PAT',
    label: 'Clarifai',
    vendorDocUrl: 'https://docs.clarifai.com/compute/inference/open-ai/',
    steps: [
      'Sign in to Clarifai and create a Personal Access Token (PAT)',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type ClarifaiRole = 'system' | 'user' | 'assistant' | 'developer' | 'tool';

interface ClarifaiMessage {
  role: ClarifaiRole;
  content: string;
}

interface ClarifaiChatResponse {
  model?: string;
  choices: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
