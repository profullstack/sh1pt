import { describe, expect, it } from 'vitest';
import * as amo from './amo-appeal.js';
import { RECIPES } from '../index.js';
import { parse, profileFor } from '../run.js';

const DECISION = 'ecb5c48f-e70d-4cc2-8bd3-e5a5562e5c3e';

describe('appealUrl', () => {
  it('builds the author appeal path from Mozilla’s url conf', () => {
    expect(amo.appealUrl(DECISION)).toBe(
      `https://addons.mozilla.org/en-US/abuse/appeal/${DECISION}/`,
    );
  });

  it('honours a locale', () => {
    expect(amo.appealUrl(DECISION, 'de')).toContain('/de/abuse/appeal/');
  });

  it('rejects something that is not a decision id', () => {
    expect(() => amo.appealUrl('not a uuid!')).toThrow(/does not look like a decision id/);
    expect(() => amo.appealUrl('')).toThrow(/does not look like a decision id/);
  });
});

describe('parseAddonState', () => {
  /**
   * The real unauthenticated response for CoinPay Wallet on 2026-09-06: a 401
   * whose body still carries the disable flags. Discarding a 401 as "auth
   * failure" would throw away the only signal that matters.
   */
  it('reads a Mozilla disable out of a 401 body', () => {
    const state = amo.parseAddonState(
      { detail: 'Authentication credentials were not provided.', is_disabled_by_developer: false, is_disabled_by_mozilla: true },
      401,
    );
    expect(state.disabledByMozilla).toBe(true);
    expect(state.disabledByDeveloper).toBe(false);
    expect(state.listed).toBe(false);
    expect(state.verdict).toMatch(/appeal is the only route back/);
  });

  it('distinguishes a developer disable, which needs no appeal', () => {
    const state = amo.parseAddonState({ is_disabled_by_developer: true, is_disabled_by_mozilla: false }, 401);
    expect(state.disabledByDeveloper).toBe(true);
    expect(state.verdict).toMatch(/Re-enable it in the Developer Hub/);
  });

  it('reports a healthy public add-on', () => {
    const state = amo.parseAddonState({ slug: 'marksyncr', status: 'public' }, 200);
    expect(state.listed).toBe(true);
    expect(state.slug).toBe('marksyncr');
    expect(state.verdict).toMatch(/Nothing to appeal/);
  });

  it('does not claim a 404 is a disable', () => {
    const state = amo.parseAddonState({ detail: 'Not found.' }, 404);
    expect(state.disabledByMozilla).toBe(false);
    expect(state.listed).toBe(false);
    expect(state.verdict).toMatch(/Check the id or slug/);
  });
});

describe('appealOutcome', () => {
  const base = { thankYou: false, alreadyDecided: false, formPresent: true, invalidEmail: false };

  it('reads the thank-you as recorded, even while other markers linger', () => {
    expect(amo.appealOutcome({ ...base, thankYou: true, alreadyDecided: true })).toBe('recorded');
  });

  it('prefers an email rejection over the form still being present', () => {
    expect(amo.appealOutcome({ ...base, invalidEmail: true })).toBe('rejected-email');
  });

  it('recognises a decision already appealed by someone else', () => {
    expect(amo.appealOutcome({ ...base, alreadyDecided: true, formPresent: false })).toBe('already-decided');
  });

  it('calls a page with no form not-appealable', () => {
    expect(amo.appealOutcome({ ...base, formPresent: false })).toBe('not-appealable');
  });

  it('admits when it cannot tell', () => {
    expect(amo.appealOutcome(base)).toBe('unknown');
  });
});

describe('registration', () => {
  it('is listed by `sh1pt browser list` with its own Mozilla profile', () => {
    const entry = RECIPES.find((r) => r.id === 'amo-appeal');
    expect(entry).toBeDefined();
    expect(entry!.actions).toEqual(['status', 'appeal']);
    expect(profileFor('amo-appeal')).toBe('mozilla');
  });

  it('parses the flags the recipe needs', () => {
    const { recipe, action, options } = parse([
      'amo-appeal', 'appeal', '--addon', '3061765', '--decision', DECISION, '--reason-file', './appeal.md',
    ]);
    expect(recipe).toBe('amo-appeal');
    expect(action).toBe('appeal');
    expect(options.addon).toBe('3061765');
    expect(options.decision).toBe(DECISION);
    expect(options.reasonFile).toBe('./appeal.md');
  });
});
