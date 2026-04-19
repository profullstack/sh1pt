import { defineBot } from '@sh1pt/core';

// WeChat Official Account — api.weixin.qq.com. Requires appId + appSecret
// for access_token + verified OA (service or subscription). Customer
// Service messages have a 48h response window.
interface Config { appId: string }

export default defineBot<Config>({
  id: 'bot-wechat',
  label: 'WeChat',
  supports: ['message', 'command', 'interaction'],

  async register(ctx, handlers, config) {
    if (!ctx.secret('WECHAT_APP_SECRET')) throw new Error('WECHAT_APP_SECRET not in vault');
    ctx.log(`bot-wechat · register ${handlers.length} handlers (app=${config.appId})`);
    if (ctx.dryRun) return { async close() {} };
    // TODO: webhook endpoint w/ signature validation; decode XML.
    return { async close() {} };
  },

  async send(ctx, channel, reply) {
    if (!ctx.secret('WECHAT_APP_SECRET')) throw new Error('WECHAT_APP_SECRET not in vault');
    ctx.log(`bot-wechat · send → openid=${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: POST /cgi-bin/message/custom/send with openid + text payload.
    return { id: `wc_${Date.now()}` };
  },
});
