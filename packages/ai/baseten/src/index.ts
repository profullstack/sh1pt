import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-baseten',
  label: 'Baseten',
  defaultModel: 'BASETEN_API_KEY',
  models: ['BASETEN_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://www.baseten.co');
    if (!apiKey) throw new Error('https://www.baseten.co not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-baseten · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-baseten integration not yet implemented]', model: 'BASETEN_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://www.baseten.co',
    label: 'Baseten',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
