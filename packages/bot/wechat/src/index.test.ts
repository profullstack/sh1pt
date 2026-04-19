import { contractTestBot } from '@sh1pt/core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { appId: 'wx_test' }, sampleChannel: 'openid_test' });
