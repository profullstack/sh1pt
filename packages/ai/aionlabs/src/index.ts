import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-aionlabs',
  label: 'AionLabs',
  defaultModel: 'aion-1.0',
  models: ['aion-1.0'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('AIONLABS_API_KEY');
    if (!apiKey) throw new Error('AIONLABS_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-aionlabs · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-aionlabs integration not yet implemented]', model: 'aion-1.0' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AIONLABS_API_KEY',
    label: 'AionLabs',
    vendorDocUrl: 'https://www.aionlabs.ai',
    steps: [
      'Sign in at https://www.aionlabs.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
