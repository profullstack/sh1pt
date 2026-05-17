import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-google-vertex',
  label: 'Google Vertex',
  defaultModel: 'gemini-1.5-pro',
  models: ['gemini-1.5-pro'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('GOOGLE_VERTEX_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_VERTEX_API_KEY not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-google-vertex · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-google-vertex integration not yet implemented]', model: 'gemini-1.5-pro' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'GOOGLE_VERTEX_API_KEY',
    label: 'Google Vertex',
    vendorDocUrl: 'https://console.cloud.google.com/vertex-ai',
    steps: [
      'Sign in at https://console.cloud.google.com/vertex-ai and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
