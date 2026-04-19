import { contractTestBot } from '@sh1pt/core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { from: '+15551234567' }, sampleChannel: '+15559876543' });
