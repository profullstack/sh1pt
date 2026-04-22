import { defineBot } from '@profullstack/sh1pt-core';

// Matrix bot — sync loop against homeserver. Access token via MATRIX_TOKEN
// (obtain via /login). E2EE rooms need an Olm/Megolm-capable client;
// default to unencrypted rooms until crypto is wired.
interface Config { homeserver?: string; userId?: string }

export default defineBot<Config>({
  id: 'bot-matrix',
  label: 'Matrix',
  supports: ['message', 'command', 'reaction', 'join', 'leave'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('MATRIX_TOKEN')) throw new Error('MATRIX_TOKEN not in vault');
    ctx.log(`bot-matrix · register ${handlers.length} handlers (hs=${config.homeserver ?? 'matrix.org'})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: /sync long-poll; filter m.room.message; dispatch.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('MATRIX_TOKEN')) throw new Error('MATRIX_TOKEN not in vault');
    ctx.log(`bot-matrix · send → room=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: PUT /rooms/:roomId/send/m.room.message/:txnId
    return { id: `m_${Date.now()}` };
  },
});
