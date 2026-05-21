import { describe, expect, it, vi } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace, {
  buildMicropubConfigQueryRequest,
  buildMicropubCreateRequest,
  buildMicropubDeleteRequest,
  buildMicropubUpdateRequest,
  discoverMicropub,
  normalizeMicropubProperties,
  parseEmbeddedMicropubLinks,
  parseMicropubLinkHeader,
  queryMicropubConfiguration,
} from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-micropub namespace', () => {
  it('declares discovery and mutation endpoints', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/micropub/');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['discover', 'publish']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['endpoint-discovery', 'create', 'update', 'delete', 'media']),
    );
    expect(namespace.endpoints.find((endpoint) => endpoint.id === 'media')?.pathHint).toContain('q=config');
  });

  it('discovers endpoints from Link headers and embedded rel links', async () => {
    expect(parseMicropubLinkHeader(
      '<https://api.example/micropub>; rel="micropub"; title="one, two", '
        + '<https://id.example/token>; rel="token_endpoint"',
      'https://example.test/profile',
    )).toEqual({
      micropubEndpoint: 'https://api.example/micropub',
      tokenEndpoint: 'https://id.example/token',
    });

    expect(parseEmbeddedMicropubLinks(
      '<html><head><link rel="authorization_endpoint" href="/auth">'
        + '<a rel="micropub" href="/micropub"></a></head></html>',
      'https://example.test/profile',
    )).toEqual({
      authorizationEndpoint: 'https://example.test/auth',
      micropubEndpoint: 'https://example.test/micropub',
    });

    const fetchMock = vi.fn(async () => new Response(
      '<link rel="micropub" href="/fallback"><link rel="authorization_endpoint" href="/auth">',
      {
        headers: {
          link: '<https://api.example/micropub>; rel="micropub", <https://id.example/token>; rel="token_endpoint"',
        },
      },
    ));

    await expect(discoverMicropub('https://example.test/profile', { fetch: fetchMock })).resolves.toEqual({
      sourceUrl: 'https://example.test/profile',
      micropubEndpoint: 'https://api.example/micropub',
      authorizationEndpoint: 'https://example.test/auth',
      tokenEndpoint: 'https://id.example/token',
    });
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://example.test/profile'), {
      method: 'GET',
      headers: {
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1',
      },
    });
  });

  it('builds JSON create, update, delete, and config query requests', () => {
    const create = buildMicropubCreateRequest({
      endpointUrl: 'https://example.test/micropub',
      accessToken: 'test-token',
      properties: {
        content: 'Hello from sh1pt',
        category: ['automation', 'w3c'],
      },
    });

    expect(create).toMatchObject({
      url: 'https://example.test/micropub',
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(create.body ?? '')).toEqual({
      type: ['h-entry'],
      properties: {
        content: ['Hello from sh1pt'],
        category: ['automation', 'w3c'],
      },
    });

    const update = buildMicropubUpdateRequest({
      endpointUrl: 'https://example.test/micropub',
      accessToken: 'test-token',
      postUrl: 'https://example.test/notes/1',
      replace: { content: 'Edited' },
      delete: ['category'],
    });
    expect(JSON.parse(update.body ?? '')).toEqual({
      action: 'update',
      url: 'https://example.test/notes/1',
      replace: { content: ['Edited'] },
      delete: ['category'],
    });

    const remove = buildMicropubDeleteRequest({
      endpointUrl: 'https://example.test/micropub',
      accessToken: 'test-token',
      postUrl: 'https://example.test/notes/1',
    });
    expect(JSON.parse(remove.body ?? '')).toEqual({
      action: 'delete',
      url: 'https://example.test/notes/1',
    });

    expect(buildMicropubConfigQueryRequest({
      endpointUrl: 'https://example.test/micropub?existing=true',
      accessToken: 'test-token',
    })).toMatchObject({
      url: 'https://example.test/micropub?existing=true&q=config',
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-token',
      },
    });
  });

  it('builds form-encoded create requests with repeated properties', () => {
    const request = buildMicropubCreateRequest({
      endpointUrl: 'https://example.test/micropub',
      accessToken: 'test-token',
      type: 'h-entry',
      format: 'form',
      properties: {
        content: 'A note',
        category: ['w3c', 'micropub'],
      },
    });
    const body = new URLSearchParams(request.body);

    expect(request.headers).toMatchObject({
      authorization: 'Bearer test-token',
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(body.get('h')).toBe('entry');
    expect(body.get('content')).toBe('A note');
    expect(body.getAll('category')).toEqual(['w3c', 'micropub']);
  });

  it('normalizes properties and reads q=config responses', async () => {
    expect(normalizeMicropubProperties({
      content: 'Hello',
      photo: ['https://example.test/photo.jpg'],
      featured: true,
    })).toEqual({
      content: ['Hello'],
      photo: ['https://example.test/photo.jpg'],
      featured: [true],
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      'media-endpoint': 'https://media.example.test/micropub',
      'syndicate-to': [{ uid: 'https://social.example/@alice', name: 'Alice' }],
    }), { headers: { 'content-type': 'application/json' } }));

    await expect(queryMicropubConfiguration({
      endpointUrl: 'https://example.test/micropub',
      accessToken: 'test-token',
    }, { fetch: fetchMock })).resolves.toEqual({
      mediaEndpoint: 'https://media.example.test/micropub',
      syndicateTo: [{ uid: 'https://social.example/@alice', name: 'Alice' }],
      raw: {
        'media-endpoint': 'https://media.example.test/micropub',
        'syndicate-to': [{ uid: 'https://social.example/@alice', name: 'Alice' }],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/micropub?q=config', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-token',
      },
    });
  });
});
