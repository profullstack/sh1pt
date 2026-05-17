import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-clarifai',
  label: 'Clarifai',
  defaultModel: 'CLARIFAI_PAT',
  models: ['CLARIFAI_PAT'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://clarifai.com');
    if (!apiKey) throw new Error('https://clarifai.com not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-clarifai · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-clarifai integration not yet implemented]', model: 'CLARIFAI_PAT' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://clarifai.com',
    label: 'Clarifai',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
