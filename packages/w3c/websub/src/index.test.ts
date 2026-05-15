import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-websub namespace', () => {
  it('declares hub discovery, subscription, callback, and distribution endpoints', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/websub/');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['subscribe', 'notify', 'verify']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['topic-discovery', 'hub-discovery', 'subscribe', 'callback-verification', 'content-distribution']),
    );
  });
});

