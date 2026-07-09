import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { contractTestBot } from '@profullstack/sh1pt-core/testing';
import type { BotEvent, BotHandler, BotReply } from '@profullstack/sh1pt-core';
import bot, { type WeChatServerInfo } from './index.js';

contractTestBot(bot, {
  sampleConfig: { appId: 'wx_test', appSecret: 'synthetic-app-secret', token: 'synthetic-callback-token' },
  sampleChannel: 'openid_test',
});

const ctx = {
  secret: () => undefined,
  log: () => {},
  dryRun: false,
};

function signature(token: string, timestamp: string, nonce: string): string {
  return createHash('sha1')
    .update([token, timestamp, nonce].sort().join(''))
    .digest('hex');
}

function signedUrl(info: WeChatServerInfo, token: string, extraParams: Record<string, string> = {}): string {
  const timestamp = extraParams.timestamp ?? '1710000000';
  const nonce = extraParams.nonce ?? 'nonce-1';
  const url = new URL(info.url);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('signature', signature(token, timestamp, nonce));
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function registerTestServer(handlers: BotHandler[] = []) {
  let resolveReady: (info: WeChatServerInfo) => void;
  const ready = new Promise<WeChatServerInfo>((resolve) => {
    resolveReady = resolve;
  });
  const handle = await bot.register(ctx, handlers, {
    appId: 'wx_app',
    appSecret: 'synthetic-app-secret',
    token: 'synthetic-callback-token',
    port: 0,
    onServerReady: (info) => resolveReady(info),
  });
  return {
    handle,
    info: await ready,
  };
}

describe('WeChat callback server', () => {
  it('verifies the official callback handshake', async () => {
    const { handle, info } = await registerTestServer();
    try {
      const ok = await fetch(signedUrl(info, 'synthetic-callback-token', { echostr: 'echo-ok' }));
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe('echo-ok');

      const denied = await fetch(`${info.url}?signature=bad&timestamp=1710000000&nonce=nonce-1&echostr=nope`);
      expect(denied.status).toBe(403);
    } finally {
      await handle.close();
    }
  });

  it('dispatches a text command and returns passive XML', async () => {
    let captured: BotEvent | undefined;
    const handler: BotHandler = {
      match: { type: 'command', command: 'status' },
      handle: vi.fn((_ctx, event) => {
        captured = event;
        return {
          text: `ok ${event.args?.join(' ')}`,
          actions: [{ id: 'docs', label: 'Docs', style: 'link', url: 'https://example.com/docs' }],
        } satisfies BotReply;
      }),
    };

    const { handle, info } = await registerTestServer([handler]);
    try {
      const xml = [
        '<xml>',
        '<ToUserName><![CDATA[gh_public_account]]></ToUserName>',
        '<FromUserName><![CDATA[openid_user]]></FromUserName>',
        '<CreateTime>1710000001</CreateTime>',
        '<MsgType><![CDATA[text]]></MsgType>',
        '<Content><![CDATA[/status now]]></Content>',
        '<MsgId>1234567890</MsgId>',
        '</xml>',
      ].join('');

      const response = await fetch(signedUrl(info, 'synthetic-callback-token'), {
        method: 'POST',
        body: xml,
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(handler.handle).toHaveBeenCalledOnce();
      expect(captured).toMatchObject({
        type: 'command',
        channel: 'openid_user',
        command: 'status',
        args: ['now'],
        replyToId: '1234567890',
      });
      expect(body).toContain('<ToUserName><![CDATA[openid_user]]></ToUserName>');
      expect(body).toContain('<FromUserName><![CDATA[gh_public_account]]></FromUserName>');
      expect(body).toContain('ok now');
      expect(body).toContain('Docs: https://example.com/docs');
    } finally {
      await handle.close();
    }
  });

  it('maps subscribe events to join events', async () => {
    const handler: BotHandler = {
      match: { type: 'join' },
      handle: vi.fn(() => ({ text: 'welcome' })),
    };

    const { handle, info } = await registerTestServer([handler]);
    try {
      const xml = [
        '<xml>',
        '<ToUserName><![CDATA[gh_public_account]]></ToUserName>',
        '<FromUserName><![CDATA[openid_user]]></FromUserName>',
        '<CreateTime>1710000002</CreateTime>',
        '<MsgType><![CDATA[event]]></MsgType>',
        '<Event><![CDATA[subscribe]]></Event>',
        '</xml>',
      ].join('');

      const response = await fetch(signedUrl(info, 'synthetic-callback-token'), {
        method: 'POST',
        body: xml,
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(handler.handle).toHaveBeenCalledWith(ctx, expect.objectContaining({
        type: 'join',
        channel: 'openid_user',
      }));
      expect(body).toContain('welcome');
    } finally {
      await handle.close();
    }
  });
});

describe('WeChat outbound send', () => {
  it('fetches an access token and sends a custom text message', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token')) {
        expect(url).toContain('appid=wx_app');
        return jsonResponse({ access_token: 'access-token-test', expires_in: 7200 });
      }

      const sendUrl = new URL(url);
      expect(sendUrl.origin).toBe('https://api.weixin.qq.com');
      expect(sendUrl.pathname).toBe('/cgi-bin/message/custom/send');
      expect(sendUrl.searchParams.get('access_token')).toBe('access-token-test');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body ?? '{}')).toEqual({
        touser: 'openid_user',
        msgtype: 'text',
        text: {
          content: 'hello\nDocs: https://example.com/docs',
        },
      });
      return jsonResponse({ errcode: 0, errmsg: 'ok', msgid: 42 });
    });

    const result = await bot.send(ctx, 'openid_user', {
      text: 'hello',
      actions: [{ id: 'docs', label: 'Docs', style: 'link', url: 'https://example.com/docs' }],
    }, {
      appId: 'wx_app',
      appSecret: 'synthetic-app-secret',
      token: 'synthetic-callback-token',
      fetch: fetchMock,
    });

    expect(result.id).toBe('42');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces WeChat API errors without leaking app credentials', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token')) {
        return jsonResponse({ access_token: 'access-token-test', expires_in: 7200 });
      }
      return jsonResponse({ errcode: 45015, errmsg: 'response out of time limit' });
    });

    await expect(bot.send(ctx, 'openid_user', { text: 'hello' }, {
      appId: 'wx_app',
      appSecret: 'synthetic-app-secret',
      token: 'synthetic-callback-token',
      fetch: fetchMock,
    })).rejects.toThrow('WeChat custom send failed (45015: response out of time limit)');
  });
});

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  };
}
