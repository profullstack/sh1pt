import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-nextbit',
  label: 'NextBit',
  defaultModel: 'NEXTBIT_API_KEY',
  models: ['NEXTBIT_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://nextbit.ai');
    if (!apiKey) throw new Error('https://nextbit.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-nextbit · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-nextbit integration not yet implemented]', model: 'NEXTBIT_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://nextbit.ai',
    label: 'NextBit',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
