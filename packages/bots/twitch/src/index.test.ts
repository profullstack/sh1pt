import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { channel: 'sh1pt' }, sampleChannel: 'sh1pt' });
