import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-perceptron',
  label: 'Perceptron',
  defaultModel: 'PERCEPTRON_API_KEY',
  models: ['PERCEPTRON_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://perceptron.ai');
    if (!apiKey) throw new Error('https://perceptron.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-perceptron · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-perceptron integration not yet implemented]', model: 'PERCEPTRON_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://perceptron.ai',
    label: 'Perceptron',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
