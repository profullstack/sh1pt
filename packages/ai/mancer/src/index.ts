import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-mancer',
  label: 'Mancer',
  defaultModel: 'MANCER_API_KEY',
  models: ['MANCER_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://mancer.tech');
    if (!apiKey) throw new Error('https://mancer.tech not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-mancer · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-mancer integration not yet implemented]', model: 'MANCER_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://mancer.tech',
    label: 'Mancer',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
