import { contractTestBot } from '@sh1pt/core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: {}, sampleChannel: '19:xxx@thread.v2' });
