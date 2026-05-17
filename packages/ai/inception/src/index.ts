import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-inception',
  label: 'Inception',
  defaultModel: 'mercury',
  models: ['mercury'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('INCEPTION_API_KEY');
    if (!apiKey) throw new Error('INCEPTION_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-inception · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-inception integration not yet implemented]', model: 'mercury' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'INCEPTION_API_KEY',
    label: 'Inception',
    vendorDocUrl: 'https://www.inceptionlabs.ai',
    steps: [
      'Sign in at https://www.inceptionlabs.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
