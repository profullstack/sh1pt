import { describe, it, expect } from 'vitest';
import type { Recipe } from '../recipe.js';

export function contractTestRecipe(r: Recipe): void {
  describe(`Recipe contract · ${r.id}`, () => {
    it('declares required fields', () => {
      expect(r.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(r.label).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(Array.isArray(r.features) && r.features.length).toBeTruthy();
    });

    if (r.pricing?.length) {
      it('pricing tiers all declare amount + currency + cadence', () => {
        for (const tier of r.pricing!) {
          expect(tier.id).toBeTruthy();
          expect(tier.amount).toBeGreaterThanOrEqual(0);
          expect(tier.currency).toMatch(/^[A-Z]{3}$/);
          expect(['monthly', 'yearly', 'lifetime']).toContain(tier.cadence);
        }
      });
    }

    if (r.referral?.enabled) {
      it('referral config is well-formed', () => {
        expect(r.referral!.rewardAmount).toBeGreaterThan(0);
        expect(r.referral!.rewardCurrency).toMatch(/^[A-Z]{3}$/);
      });
    }

    if (r.prompts) {
      it('prompt keys match known boilerplates (or future ones)', () => {
        const prompts = r.prompts!;
        for (const key of Object.keys(prompts)) {
          const prompt = prompts[key];
          if (prompt) expect(prompt.length).toBeGreaterThan(50);
        }
      });
    }
  });
}
