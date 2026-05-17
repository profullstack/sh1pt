import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-liquid',
  label: 'Liquid AI',
  defaultModel: 'lfm-40b',
  models: ['lfm-40b'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('LIQUID_API_KEY');
    if (!apiKey) throw new Error('LIQUID_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-liquid · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-liquid integration not yet implemented]', model: 'lfm-40b' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'LIQUID_API_KEY',
    label: 'Liquid AI',
    vendorDocUrl: 'https://www.liquid.ai',
    steps: [
      'Sign in at https://www.liquid.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
