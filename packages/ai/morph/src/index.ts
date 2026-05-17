import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-morph',
  label: 'Morph',
  defaultModel: 'morph-v2',
  models: ['morph-v2'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('MORPH_API_KEY');
    if (!apiKey) throw new Error('MORPH_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-morph · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-morph integration not yet implemented]', model: 'morph-v2' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MORPH_API_KEY',
    label: 'Morph',
    vendorDocUrl: 'https://morphllm.com',
    steps: [
      'Sign in at https://morphllm.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
