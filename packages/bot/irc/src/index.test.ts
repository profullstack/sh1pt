import { contractTestBot } from '@sh1pt/core/testing';
import bot from './index.js';

contractTestBot(bot, { sampleConfig: { server: 'irc.libera.chat', nick: 'sh1ptbot', channels: ['#sh1pt'] }, sampleChannel: '#sh1pt' });
