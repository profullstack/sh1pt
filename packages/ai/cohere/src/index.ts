import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-cohere',
  label: 'Cohere',
  defaultModel: 'command-r-plus',
  models: ['command-r-plus'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('COHERE_API_KEY');
    if (!apiKey) throw new Error('COHERE_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-cohere · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-cohere integration not yet implemented]', model: 'command-r-plus' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'COHERE_API_KEY',
    label: 'Cohere',
    vendorDocUrl: 'https://dashboard.cohere.com',
    steps: [
      'Sign in at https://dashboard.cohere.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
