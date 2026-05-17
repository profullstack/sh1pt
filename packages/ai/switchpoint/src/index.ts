import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-switchpoint',
  label: 'Switchpoint',
  defaultModel: 'SWITCHPOINT_API_KEY',
  models: ['SWITCHPOINT_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://switchpoint.ai');
    if (!apiKey) throw new Error('https://switchpoint.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-switchpoint · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-switchpoint integration not yet implemented]', model: 'SWITCHPOINT_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://switchpoint.ai',
    label: 'Switchpoint',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
