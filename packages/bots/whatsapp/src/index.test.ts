import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '15551234567@s.whatsapp.net' });
