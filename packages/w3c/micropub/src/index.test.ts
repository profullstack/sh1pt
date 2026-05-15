import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import namespace from './index.js';

smokeTest(namespace, { idPrefix: 'w3c' });

describe('w3c-micropub namespace', () => {
  it('declares discovery and mutation endpoints', () => {
    expect(namespace.specUrl).toBe('https://www.w3.org/TR/micropub/');
    expect(namespace.capabilities).toEqual(expect.arrayContaining(['discover', 'publish']));
    expect(namespace.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['endpoint-discovery', 'create', 'update', 'delete', 'media']),
    );
  });
});

