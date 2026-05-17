import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
}

export default defineAi<Config>({
  id: 'ai-amazon-bedrock',
  label: 'Amazon Bedrock',
  defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  models: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],

  async generate(ctx, prompt, _opts, _config) {
    const apiKey = ctx.secret('AWS_BEDROCK_ACCESS_KEY_ID');
    if (!apiKey) throw new Error('AWS_BEDROCK_ACCESS_KEY_ID not in vault — run `sh1pt promote ai setup`');
    ctx.log(`[stub] ai-amazon-bedrock · ${prompt.length} chars in — integration pending`);
    return { text: '[stub — ai-amazon-bedrock integration not yet implemented]', model: 'anthropic.claude-3-5-sonnet-20241022-v2:0' };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AWS_BEDROCK_ACCESS_KEY_ID',
    label: 'Amazon Bedrock',
    vendorDocUrl: 'https://aws.amazon.com/bedrock',
    steps: [
      'Sign in at https://aws.amazon.com/bedrock and create an API key',
      'Copy the key — usually shown once',
      'Paste below; sh1pt encrypts it in the vault',
    ],
  }),
});
