import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-akashml',
  label: 'Akash ML',
  defaultModel: 'AKASH_API_KEY',
  models: ['AKASH_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://chatapi.akash.network');
    if (!apiKey) throw new Error('https://chatapi.akash.network not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-akashml · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-akashml integration not yet implemented]', model: 'AKASH_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://chatapi.akash.network',
    label: 'Akash ML',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
