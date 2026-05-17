import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-inceptron',
  label: 'Inceptron',
  defaultModel: 'INCEPTRON_API_KEY',
  models: ['INCEPTRON_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://inceptron.ai');
    if (!apiKey) throw new Error('https://inceptron.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-inceptron · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-inceptron integration not yet implemented]', model: 'INCEPTRON_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://inceptron.ai',
    label: 'Inceptron',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
