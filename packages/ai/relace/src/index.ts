import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://instantapply.endpoint.relace.run';
const DEFAULT_MODEL = 'relace-apply-3';

export default defineAi<Config>({
  id: 'ai-relace',
  label: 'Relace',
  defaultModel: DEFAULT_MODEL,
  models: [DEFAULT_MODEL],

  async generate(ctx, prompt, opts, config) {
    const apiKey = ctx.secret('RELACE_API_KEY');
    if (!apiKey) throw new Error('RELACE_API_KEY not in vault');
    const model = opts.model ?? DEFAULT_MODEL;
    const input = buildApplyInput(prompt, opts.system, opts.extra);
    ctx.log(`relace · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const body: RelaceApplyRequest = {
      model,
      initial_code: input.initialCode,
      edit_snippet: input.editSnippet,
      stream: false,
    };
    if (input.instruction) body.instruction = input.instruction;
    if (isRecord(opts.extra?.relace_metadata)) body.relace_metadata = opts.extra.relace_metadata;

    const res = await fetch(`${(config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')}/v1/code/apply`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Relace ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as RelaceApplyResponse;
    return {
      text: data.mergedCode ?? '',
      model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'RELACE_API_KEY',
    label: 'Relace',
    vendorDocUrl: 'https://docs.relace.ai/api-reference/instant-apply/apply',
    steps: [
      'Sign in at https://app.relace.ai and create an API key',
      'Copy the key - usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});

interface RelaceApplyRequest {
  model: string;
  initial_code: string;
  edit_snippet: string;
  instruction?: string;
  stream: false;
  relace_metadata?: Record<string, unknown>;
}

interface RelaceApplyResponse {
  mergedCode?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface ApplyInput {
  initialCode: string;
  editSnippet: string;
  instruction?: string;
}

function buildApplyInput(
  prompt: string,
  system: string | undefined,
  extra: Record<string, unknown> | undefined,
): ApplyInput {
  const tagged = parseTaggedApplyPrompt(prompt);
  const initialCode = stringExtra(extra, 'initialCode', 'initial_code') ?? tagged.initialCode ?? '';
  const editSnippet = stringExtra(extra, 'editSnippet', 'edit_snippet') ?? tagged.editSnippet ?? prompt;
  const instruction = stringExtra(extra, 'instruction') ?? system ?? tagged.instruction;

  return {
    initialCode,
    editSnippet,
    ...(instruction ? { instruction } : {}),
  };
}

function parseTaggedApplyPrompt(prompt: string): Partial<ApplyInput> {
  return {
    initialCode: tagValue(prompt, 'code'),
    editSnippet: tagValue(prompt, 'update'),
    instruction: tagValue(prompt, 'instruction'),
  };
}

function tagValue(prompt: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(prompt);
  return match?.[1]?.trim();
}

function stringExtra(extra: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = extra?.[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
