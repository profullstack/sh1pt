import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-openinference',
  label: 'OpenInference',
  defaultModel: 'OPENINFERENCE_API_KEY',
  models: ['OPENINFERENCE_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://openinference.ai');
    if (!apiKey) throw new Error('https://openinference.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-openinference · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-openinference integration not yet implemented]', model: 'OPENINFERENCE_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://openinference.ai',
    label: 'OpenInference',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
