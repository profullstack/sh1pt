import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-stepfun',
  label: 'StepFun',
  defaultModel: 'step-2-16k',
  models: ['step-2-16k'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('STEPFUN_API_KEY');
    if (!apiKey) throw new Error('STEPFUN_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-stepfun · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-stepfun integration not yet implemented]', model: 'step-2-16k' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'STEPFUN_API_KEY',
    label: 'StepFun',
    vendorDocUrl: 'https://platform.stepfun.com',
    steps: [
      'Sign in at https://platform.stepfun.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
