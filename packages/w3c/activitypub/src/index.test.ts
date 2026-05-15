import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-activitypub namespace', () => {
  it('declares ActivityPub endpoints needed for actor federation', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/activitypub/');
    expect(namespace.namespace).toBe('https://www.w3.org/ns/activitystreams');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['publish', 'receive', 'verify']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['actor', 'inbox', 'outbox', 'followers', 'following']),
    );
  });
});

