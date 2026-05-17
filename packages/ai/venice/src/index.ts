import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-venice',
  label: 'Venice AI',
  defaultModel: 'llama-3.3-70b',
  models: ['llama-3.3-70b'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('VENICE_API_KEY');
    if (!apiKey) throw new Error('VENICE_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-venice · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-venice integration not yet implemented]', model: 'llama-3.3-70b' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'VENICE_API_KEY',
    label: 'Venice AI',
    vendorDocUrl: 'https://venice.ai',
    steps: [
      'Sign in at https://venice.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
