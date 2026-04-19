import type { Rule, Finding } from '../rule.js';

// Flags ship velocity that Apple/Google treat as spam. Stores have
// internal "new apps per developer per week" thresholds that trigger
// manual review holds or account suspension.
export const rateShape: Rule = {
  id: 'account/rate-shape',
  description: 'Submission rate must stay under store spam thresholds.',
  run({ existingListings = [] }) {
    const findings: Finding[] = [];
    // In a real impl: query prior 7 days of ships per store.
    // Thresholds here are conservative estimates, not published numbers.
    const thresholds: Record<string, number> = {
      'App Store': 5,
      'Google Play': 10,
      'Chrome Web Store': 20,
    };
    const perStore = new Map<string, number>();
    for (const l of existingListings) perStore.set(l.store, (perStore.get(l.store) ?? 0) + 1);
    for (const [store, count] of perStore) {
      const limit = thresholds[store];
      if (limit && count >= limit) {
        findings.push({
          ruleId: this.id,
          severity: count >= limit * 1.5 ? 'error' : 'warn',
          message: `${count} submissions to ${store} in recent window (threshold ${limit}) — risk of manual review hold or account flag`,
          fix: 'stagger ships across days, or use --channel beta to route through test tracks',
        });
      }
    }
    return findings;
  },
};
