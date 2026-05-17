import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-relace',
  label: 'Relace',
  defaultModel: 'RELACE_API_KEY',
  models: ['RELACE_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://relace.ai');
    if (!apiKey) throw new Error('https://relace.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-relace · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-relace integration not yet implemented]', model: 'RELACE_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://relace.ai',
    label: 'Relace',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
