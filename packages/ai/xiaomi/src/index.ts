import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-xiaomi',
  label: 'Xiaomi',
  defaultModel: 'XIAOMI_API_KEY',
  models: ['XIAOMI_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://www.xiaomi.com');
    if (!apiKey) throw new Error('https://www.xiaomi.com not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-xiaomi · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-xiaomi integration not yet implemented]', model: 'XIAOMI_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://www.xiaomi.com',
    label: 'Xiaomi',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
