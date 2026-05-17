import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-phala',
  label: 'Phala',
  defaultModel: 'PHALA_API_KEY',
  models: ['PHALA_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://phala.network');
    if (!apiKey) throw new Error('https://phala.network not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-phala · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-phala integration not yet implemented]', model: 'PHALA_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://phala.network',
    label: 'Phala',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
