import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-ai21',
  label: 'AI21',
  defaultModel: 'jamba-1.5-large',
  models: ['jamba-1.5-large'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('AI21_API_KEY');
    if (!apiKey) throw new Error('AI21_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-ai21 · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-ai21 integration not yet implemented]', model: 'jamba-1.5-large' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AI21_API_KEY',
    label: 'AI21',
    vendorDocUrl: 'https://studio.ai21.com',
    steps: [
      'Sign in at https://studio.ai21.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
