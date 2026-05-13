import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
  baseUrl?: string;
}

const DEFAULT_API_VERSION = '2024-06-01';

export default defineAi<Config>({
  id: 'ai-azure',
  label: 'Azure OpenAI',
  defaultModel: 'gpt-4o',
  models: ['gpt-4o'],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('AZURE_OPENAI_API_KEY');
    if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY not in vault — run `sh1pt promote ai setup`');
    const model = opts.model ?? config.deployment ?? 'gpt-4o';
    ctx.log(`azure · deployment=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const endpoint = (config.endpoint ?? config.baseUrl)?.replace(/\/$/, '');
    if (!endpoint) throw new Error('Azure OpenAI endpoint config required');
    const deployment = config.deployment ?? model;
    const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(
      `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
      {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...opts.extra,
        }),
      }
    );
    if (!res.ok) throw new Error(`Azure OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message?.content ?? '',
      model: data.model ?? deployment,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AZURE_OPENAI_API_KEY',
    label: 'Azure OpenAI',
    vendorDocUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/reference',
    steps: [
      'Open the Azure OpenAI resource in portal.azure.com',
      'Copy the resource endpoint and one API key',
      'Use a deployed chat model name as the deployment',
      'Paste below; sh1pt encrypts the API key in the vault',
    ],
    fields: [
      { key: 'endpoint', message: 'Azure OpenAI endpoint, e.g. https://my-resource.openai.azure.com:', required: true },
      { key: 'deployment', message: 'Azure OpenAI deployment name:' },
      { key: 'apiVersion', message: 'API version (default 2024-06-01):' },
    ],
  }),
});
