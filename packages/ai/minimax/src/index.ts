import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-minimax',
  label: 'MiniMax',
  defaultModel: 'abab6.5-chat',
  models: ['abab6.5-chat'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('MINIMAX_API_KEY');
    if (!apiKey) throw new Error('MINIMAX_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-minimax · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-minimax integration not yet implemented]', model: 'abab6.5-chat' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MINIMAX_API_KEY',
    label: 'MiniMax',
    vendorDocUrl: 'https://www.minimaxi.com',
    steps: [
      'Sign in at https://www.minimaxi.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
