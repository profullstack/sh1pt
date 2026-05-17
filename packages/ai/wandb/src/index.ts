import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-wandb',
  label: 'Weights & Biases',
  defaultModel: 'WANDB_API_KEY',
  models: ['WANDB_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://wandb.ai');
    if (!apiKey) throw new Error('https://wandb.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-wandb · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-wandb integration not yet implemented]', model: 'WANDB_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://wandb.ai',
    label: 'Weights & Biases',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
