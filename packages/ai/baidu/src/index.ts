import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-baidu',
  label: 'Baidu Qianfan',
  defaultModel: 'ernie-4.5',
  models: ['ernie-4.5'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('QIANFAN_API_KEY');
    if (!apiKey) throw new Error('QIANFAN_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-baidu · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-baidu integration not yet implemented]', model: 'ernie-4.5' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'QIANFAN_API_KEY',
    label: 'Baidu Qianfan',
    vendorDocUrl: 'https://qianfan.cloud.baidu.com',
    steps: [
      'Sign in at https://qianfan.cloud.baidu.com and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
