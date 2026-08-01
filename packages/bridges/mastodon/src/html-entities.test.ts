import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './html-entities.js';

describe('decodeHtmlEntities', () => {
  it('decodes supported named and numeric entities', () => {
    expect(decodeHtmlEntities('&amp; &LT; &#65; &#x1F680;')).toBe('& < A 🚀');
  });

  it('preserves unknown named entities', () => {
    expect(decodeHtmlEntities('&copy;')).toBe('&copy;');
  });

  it.each([
    '&#1114112;',
    '&#999999999999999999999999;',
    '&#x110000;',
    '&#xD800;',
  ])('preserves an invalid numeric entity: %s', (entity) => {
    expect(decodeHtmlEntities(entity)).toBe(entity);
  });
});
