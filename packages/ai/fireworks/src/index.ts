import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-fireworks',
  label: 'Fireworks AI',
  defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  models: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('FIREWORKS_API_KEY');
    if (!apiKey) throw new Error('FIREWORKS_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-fireworks · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-fireworks integration not yet implemented]', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'FIREWORKS_API_KEY',
    label: 'Fireworks AI',
    vendorDocUrl: 'https://fireworks.ai',
    steps: [
      'Sign in at https://fireworks.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
