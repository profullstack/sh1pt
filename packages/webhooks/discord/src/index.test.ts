import { contractTestWebhook } from '@profullstack/sh1pt-core/testing';
import webhook from './index.js';

contractTestWebhook(webhook, {
  sampleConfig: {},
  requiredSecrets: ['DISCORD_WEBHOOK_URL'],
});
