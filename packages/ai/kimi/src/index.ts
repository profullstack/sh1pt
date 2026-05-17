import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-kimi',
  label: 'Kimi (Moonshot)',
  defaultModel: 'kimi-k2-0905-preview',
  models: ['kimi-k2-0905-preview'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('MOONSHOT_API_KEY');
    if (!apiKey) throw new Error('MOONSHOT_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-kimi · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-kimi integration not yet implemented]', model: 'kimi-k2-0905-preview' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'MOONSHOT_API_KEY',
    label: 'Kimi (Moonshot)',
    vendorDocUrl: 'https://platform.moonshot.ai',
    steps: [
      'Sign in at https://platform.moonshot.ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
