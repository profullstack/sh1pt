import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-together',
  label: 'Together AI',
  defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('TOGETHER_API_KEY');
    if (!apiKey) throw new Error('TOGETHER_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-together · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-together integration not yet implemented]', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'TOGETHER_API_KEY',
    label: 'Together AI',
    vendorDocUrl: 'https://api.together.xyz',
    steps: [
      'Sign in at https://api.together.xyz and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
