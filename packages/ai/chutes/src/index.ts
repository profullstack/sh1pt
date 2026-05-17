import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-chutes',
  label: 'Chutes',
  defaultModel: 'CHUTES_API_KEY',
  models: ['CHUTES_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://chutes.ai');
    if (!apiKey) throw new Error('https://chutes.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-chutes · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-chutes integration not yet implemented]', model: 'CHUTES_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://chutes.ai',
    label: 'Chutes',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
