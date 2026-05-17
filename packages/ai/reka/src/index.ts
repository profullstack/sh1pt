import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-reka',
  label: 'Reka AI',
  defaultModel: 'reka-core',
  models: ['reka-core'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('REKA_API_KEY');
    if (!apiKey) throw new Error('REKA_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-reka · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-reka integration not yet implemented]', model: 'reka-core' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'REKA_API_KEY',
    label: 'Reka AI',
    vendorDocUrl: 'https://www.reka.ai',
    steps: [
      'Sign in at https://www.reka.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
