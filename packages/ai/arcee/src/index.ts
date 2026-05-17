import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-arcee',
  label: 'Arcee AI',
  defaultModel: 'virtuoso-large',
  models: ['virtuoso-large'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('ARCEE_API_KEY');
    if (!apiKey) throw new Error('ARCEE_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-arcee · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-arcee integration not yet implemented]', model: 'virtuoso-large' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'ARCEE_API_KEY',
    label: 'Arcee AI',
    vendorDocUrl: 'https://www.arcee.ai',
    steps: [
      'Sign in at https://www.arcee.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
