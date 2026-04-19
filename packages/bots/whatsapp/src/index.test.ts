import { contractTestBot } from '@sh1pt/core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { phoneNumberId: '123456789' }, sampleChannel: '+15551234567' });
