import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-siliconflow',
  label: 'SiliconFlow',
  defaultModel: 'SILICONFLOW_API_KEY',
  models: ['SILICONFLOW_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://siliconflow.cn');
    if (!apiKey) throw new Error('https://siliconflow.cn not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-siliconflow · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-siliconflow integration not yet implemented]', model: 'SILICONFLOW_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://siliconflow.cn',
    label: 'SiliconFlow',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
