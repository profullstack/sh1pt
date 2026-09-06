import { describe, expect, it } from 'vitest';
import { desktopUserAgent, findSystemChrome, DEFAULT_ROOT } from './session.js';
import { RECIPES } from './index.js';

describe('desktopUserAgent', () => {
  it('never announces a headless browser', () => {
    const ua = desktopUserAgent();
    expect(ua).not.toMatch(/headless/i);
    expect(ua).toMatch(/^Mozilla\/5\.0 /);
    expect(ua).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36$/);
  });

  it('falls back to a plausible version when the binary cannot be asked', () => {
    expect(desktopUserAgent('/nope/not/a/browser')).toMatch(/Chrome\/\d+/);
  });
});

describe('findSystemChrome', () => {
  it('returns an absolute path or nothing at all', () => {
    const found = findSystemChrome();
    if (found !== undefined) expect(found.startsWith('/')).toBe(true);
  });
});

describe('recipe registry', () => {
  it('gives every recipe an id, a profile and a reason it needs a browser', () => {
    expect(RECIPES.length).toBeGreaterThan(0);
    for (const recipe of RECIPES) {
      expect(recipe.id).toMatch(/^[a-z0-9-]+$/);
      expect(recipe.profile).toMatch(/^[a-z0-9-]+$/);
      expect(recipe.because.length).toBeGreaterThan(20);
      expect(recipe.actions.length).toBeGreaterThan(0);
    }
  });

  it('keeps profiles under one root so a sign-in is reusable', () => {
    expect(DEFAULT_ROOT).toMatch(/sh1pt\/browser$/);
  });
});
