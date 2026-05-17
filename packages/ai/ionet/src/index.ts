import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-ionet',
  label: 'io.net',
  defaultModel: 'IONET_API_KEY',
  models: ['IONET_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://io.net');
    if (!apiKey) throw new Error('https://io.net not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-ionet · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-ionet integration not yet implemented]', model: 'IONET_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://io.net',
    label: 'io.net',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
