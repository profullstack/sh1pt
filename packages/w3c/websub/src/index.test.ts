import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace, {
  buildSubscriptionRequest,
  discoverWebSub,
  parseEmbeddedWebSubLinks,
  parseLinkHeader,
  verifyDistributionSignature,
  verifyIntentRequest,
} from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-websub namespace', () => {
  it('declares hub discovery, subscription, callback, and distribution endpoints', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/websub/');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['subscribe', 'notify', 'verify']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['topic-discovery', 'hub-discovery', 'subscribe', 'callback-verification', 'content-distribution']),
    );
  });

  it('discovers self and hub links from HTTP Link headers before reading the body', async () => {
    let bodyRead = false;
    const response = new Response('<link rel="hub" href="https://body.example/hub">', {
      headers: {
        link: '<https://hub.example/>; rel="hub", </feed.json>; rel="self"',
      },
    });
    Object.defineProperty(response, 'url', { value: 'https://example.test/feed' });
    Object.defineProperty(response, 'text', {
      value: async () => {
        bodyRead = true;
        return '<link rel="hub" href="https://body.example/hub">';
      },
    });
    const fetcher = async () => {
      return response;
    };

    await expect(discoverWebSub('https://example.test/feed', { fetch: fetcher })).resolves.toEqual({
      sourceUrl: 'https://example.test/feed',
      topicUrl: 'https://example.test/feed.json',
      hubs: ['https://hub.example/'],
    });
    expect(bodyRead).toBe(false);
  });

  it('falls back to embedded HTML link discovery', async () => {
    const html = `
      <html>
        <head>
          <link rel="hub" href="/hub">
          <link rel="self" href="/feed">
        </head>
        <body><link rel="hub" href="https://ignored.example/"></body>
      </html>
    `;
    const fetcher = async () => new Response(html, { headers: { 'content-type': 'text/html' } });

    await expect(discoverWebSub('https://example.test/page', { fetch: fetcher })).resolves.toEqual({
      sourceUrl: 'https://example.test/page',
      topicUrl: 'https://example.test/feed',
      hubs: ['https://example.test/hub'],
    });
  });
});

describe('WebSub helpers', () => {
  it('parses comma-separated Link headers with multi-rel values', () => {
    expect(parseLinkHeader('</feed.atom>; rel="self alternate", <https://hub.one/>; rel=hub, <https://hub.two/>; rel="hub"', 'https://example.test')).toEqual({
      sourceUrl: 'https://example.test',
      topicUrl: 'https://example.test/feed.atom',
      hubs: ['https://hub.one/', 'https://hub.two/'],
    });
  });

  it('parses embedded link elements from XML or HTML', () => {
    expect(parseEmbeddedWebSubLinks('<feed><link rel="self" href="/atom"/><link href="/hub" rel="hub"/></feed>', 'https://example.test/root')).toEqual({
      sourceUrl: 'https://example.test/root',
      topicUrl: 'https://example.test/atom',
      hubs: ['https://example.test/hub'],
    });
  });

  it('builds a form-encoded subscribe or unsubscribe request', () => {
    const request = buildSubscriptionRequest({
      hubUrl: 'https://hub.example/',
      callbackUrl: 'https://subscriber.example/websub/callback/capability',
      topicUrl: 'https://publisher.example/feed',
      mode: 'subscribe',
      leaseSeconds: 864000,
      secret: 'shared-secret',
      extraParams: { 'x-vendor': 'ok' },
    });

    expect(request).toMatchObject({
      url: 'https://hub.example/',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    });

    const body = new URLSearchParams(request.body);
    expect(body.get('hub.callback')).toBe('https://subscriber.example/websub/callback/capability');
    expect(body.get('hub.mode')).toBe('subscribe');
    expect(body.get('hub.topic')).toBe('https://publisher.example/feed');
    expect(body.get('hub.lease_seconds')).toBe('864000');
    expect(body.get('hub.secret')).toBe('shared-secret');
    expect(body.get('x-vendor')).toBe('ok');
  });

  it('rejects secrets that violate the WebSub 200-byte limit', () => {
    expect(() => buildSubscriptionRequest({
      hubUrl: 'https://hub.example/',
      callbackUrl: 'https://subscriber.example/callback',
      topicUrl: 'https://publisher.example/feed',
      mode: 'subscribe',
      secret: 'x'.repeat(200),
    })).toThrow('hub.secret must be less than 200 bytes');
  });

  it('verifies callback intent requests and returns the challenge to echo', () => {
    const intent = verifyIntentRequest(new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.topic': 'https://publisher.example/feed',
      'hub.challenge': 'challenge-token',
      'hub.lease_seconds': '600',
    }), 'https://publisher.example/feed');

    expect(intent).toEqual({
      mode: 'subscribe',
      topic: 'https://publisher.example/feed',
      challenge: 'challenge-token',
      leaseSeconds: 600,
    });
  });

  it('validates distribution signatures with a timing-safe HMAC comparison', () => {
    const body = Buffer.from('feed payload');
    const secret = 'shared-secret';
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    expect(verifyDistributionSignature({
      body,
      secret,
      signatureHeader: `sha256=${signature}`,
    })).toBe(true);
    expect(verifyDistributionSignature({
      body,
      secret,
      signatureHeader: `sha256=${'0'.repeat(signature.length)}`,
    })).toBe(false);
  });
});
