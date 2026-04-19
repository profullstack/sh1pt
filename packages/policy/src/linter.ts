import type { LintContext, LintResult, Rule } from './rule.js';
import { requiredFields } from './rules/required-fields.js';
import { forbiddenKeywords } from './rules/forbidden-keywords.js';
import { uniqueMetadata } from './rules/unique-metadata.js';
import { bundleId } from './rules/bundle-id.js';
import { iconSizes } from './rules/icon-sizes.js';
import { rateShape } from './rules/rate-shape.js';

export const defaultRules: Rule[] = [
  requiredFields,
  forbiddenKeywords,
  uniqueMetadata,
  bundleId,
  iconSizes,
  rateShape,
];

export async function lint(ctx: LintContext, rules: Rule[] = defaultRules): Promise<LintResult> {
  const findings = (await Promise.all(rules.map((r) => r.run(ctx)))).flat();
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  return { findings, errors, warnings, passed: errors === 0 };
}
