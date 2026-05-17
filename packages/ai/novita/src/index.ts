import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-novita',
  label: 'NovitaAI',
  defaultModel: 'meta-llama/llama-3.3-70b-instruct',
  models: ['meta-llama/llama-3.3-70b-instruct'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('NOVITA_API_KEY');
    if (!apiKey) throw new Error('NOVITA_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-novita · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-novita integration not yet implemented]', model: 'meta-llama/llama-3.3-70b-instruct' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'NOVITA_API_KEY',
    label: 'NovitaAI',
    vendorDocUrl: 'https://novita.ai',
    steps: [
      'Sign in at https://novita.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
