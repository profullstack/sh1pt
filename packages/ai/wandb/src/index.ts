import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
  project?: string;
}

const DEFAULT_BASE = 'https://api.inference.wandb.ai/v1';
const DEFAULT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

export default defineAi<Config>({
  id: 'ai-wandb',
  label: 'Weights & Biases',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'meta-llama/Llama-3.3-70B-Instruct',
    'deepseek-ai/DeepSeek-V3-0324',
  ],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('WANDB_API_KEY');
    if (!apiKey) throw new Error('WANDB_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`wandb inference - model=${model} - ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const messages: WandbMessage[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    };
    if (config.project) headers['OpenAI-Project'] = config.project;

    const res = await fetch(`${config.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...opts.extra,
      }),
    });
    if (!res.ok) throw new Error(`W&B Inference ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as WandbChatResponse;
    const choice = data.choices[0];
    return {
      text: choice?.message?.content ?? choice?.text ?? '',
      model: data.model ?? model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'WANDB_API_KEY',
    label: 'Weights & Biases',
    vendorDocUrl: 'https://docs.wandb.ai/inference/api-reference/chat-completions',
    steps: [
      'Sign in at https://wandb.ai/settings and create an API key',
      'Copy the key; it is usually shown once',
      'Optionally configure project as <team>/<project> for W&B usage tracking',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

type WandbRole = 'system' | 'user' | 'assistant' | 'tool';

interface WandbMessage {
  role: WandbRole;
  content: string;
}

interface WandbChatResponse {
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
