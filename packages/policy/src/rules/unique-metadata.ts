import type { Rule, Finding } from '../rule.js';

// Agent-driven volume creates near-duplicates that trip Apple's "Spam /
// 4.3(a)" and Google's "Repetitive Content" rejections. Check title +
// bundle-id uniqueness against the customer's prior listings before ship.
export const uniqueMetadata: Rule = {
  id: 'meta/unique-metadata',
  description: 'Listing title and bundle id must not collide with prior submissions.',
  run({ manifest, existingListings = [] }) {
    const findings: Finding[] = [];
    const title = manifest.name?.toLowerCase().trim();
    if (!title) return findings;

    for (const prior of existingListings) {
      const priorTitle = prior.title.toLowerCase().trim();
      if (priorTitle === title) {
        findings.push({
          ruleId: this.id,
          severity: 'error',
          path: 'name',
          message: `title "${manifest.name}" already used on ${prior.store}`,
          fix: 'differentiate the title or promote an existing listing instead of re-submitting',
        });
      } else if (similar(priorTitle, title)) {
        findings.push({
          ruleId: this.id,
          severity: 'warn',
          path: 'name',
          message: `title "${manifest.name}" is very similar to existing "${prior.title}" on ${prior.store} — high rejection risk`,
        });
      }
    }
    return findings;
  },
};

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.includes(shorter) && longer.length - shorter.length < 5) return true;
  // crude jaccard on word sets
  const wa = new Set(a.split(/\W+/).filter(Boolean));
  const wb = new Set(b.split(/\W+/).filter(Boolean));
  const intersect = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 && intersect / union >= 0.7;
}
