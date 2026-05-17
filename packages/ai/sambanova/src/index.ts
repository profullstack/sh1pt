import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-sambanova',
  label: 'SambaNova',
  defaultModel: 'Meta-Llama-3.3-70B-Instruct',
  models: ['Meta-Llama-3.3-70B-Instruct'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('SAMBANOVA_API_KEY');
    if (!apiKey) throw new Error('SAMBANOVA_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-sambanova · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-sambanova integration not yet implemented]', model: 'Meta-Llama-3.3-70B-Instruct' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'SAMBANOVA_API_KEY',
    label: 'SambaNova',
    vendorDocUrl: 'https://cloud.sambanova.ai',
    steps: [
      'Sign in at https://cloud.sambanova.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
