import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-infermatic',
  label: 'Infermatic',
  defaultModel: 'INFERMATIC_API_KEY',
  models: ['INFERMATIC_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://infermatic.ai');
    if (!apiKey) throw new Error('https://infermatic.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-infermatic · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-infermatic integration not yet implemented]', model: 'INFERMATIC_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://infermatic.ai',
    label: 'Infermatic',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
