import type { Rule, Finding } from '../rule.js';

// Stores universally reject titles/descriptions containing these terms or
// near-variants. Most common trigger for agent-generated slop getting
// bounced at review.
const BANNED = [
  /\bfree\s+(download|money|gift)\b/i,
  /\b#1\s+(app|choice)\b/i,
  /\bbest\s+ever\b/i,
  /\bguaranteed\b/i,
  /\bmiracle\b/i,
  /\b(cheat|hack|crack|pirat)/i,
  /\bofficial\b/i, // only if user isn't actually the rights holder — flag for review
];

export const forbiddenKeywords: Rule = {
  id: 'meta/forbidden-keywords',
  description: 'App title/description must not contain spammy or store-prohibited phrases.',
  run({ manifest }) {
    const findings: Finding[] = [];
    const haystacks: { path: string; text: string }[] = [
      { path: 'name', text: manifest.name ?? '' },
      { path: 'description', text: manifest.description ?? '' },
    ];
    for (const { path, text } of haystacks) {
      for (const pattern of BANNED) {
        if (pattern.test(text)) {
          findings.push({
            ruleId: this.id,
            severity: 'warn',
            path,
            message: `"${path}" matches prohibited pattern ${pattern} — stores commonly reject this`,
          });
        }
      }
    }
    return findings;
  },
};
