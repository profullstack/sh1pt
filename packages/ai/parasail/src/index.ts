import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-parasail',
  label: 'Parasail',
  defaultModel: 'PARASAIL_API_KEY',
  models: ['PARASAIL_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://parasail.io');
    if (!apiKey) throw new Error('https://parasail.io not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-parasail · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-parasail integration not yet implemented]', model: 'PARASAIL_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://parasail.io',
    label: 'Parasail',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
