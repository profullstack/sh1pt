import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-atlascloud',
  label: 'AtlasCloud',
  defaultModel: 'ATLASCLOUD_API_KEY',
  models: ['ATLASCLOUD_API_KEY'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('https://atlascloud.ai');
    if (!apiKey) throw new Error('https://atlascloud.ai not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-atlascloud · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-atlascloud integration not yet implemented]', model: 'ATLASCLOUD_API_KEY' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'https://atlascloud.ai',
    label: 'AtlasCloud',
    vendorDocUrl: '',
    steps: [
      'Sign in at  and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
