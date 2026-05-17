import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-inflection',
  label: 'Inflection',
  defaultModel: 'inflection-3-productivity',
  models: ['inflection-3-productivity'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('INFLECTION_API_KEY');
    if (!apiKey) throw new Error('INFLECTION_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-inflection · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-inflection integration not yet implemented]', model: 'inflection-3-productivity' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'INFLECTION_API_KEY',
    label: 'Inflection',
    vendorDocUrl: 'https://inflection.ai',
    steps: [
      'Sign in at https://inflection.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
