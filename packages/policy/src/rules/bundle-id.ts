import type { Rule, Finding } from '../rule.js';

// Each reverse-DNS label must start with a letter and end with an
// alphanumeric; hyphens are only allowed between alphanumerics. The previous
// pattern (`[a-zA-Z][a-zA-Z0-9-]*`) let a label end with a hyphen, so
// "com.foo.bar-" passed even though Apple App Store Connect and Google Play
// both reject a bundle/application id with a trailing (or doubled) hyphen.
const BUNDLE_RE = /^[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*(\.[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*)+$/;

export const bundleId: Rule = {
  id: 'mobile/bundle-id',
  appliesTo: ['mobile', 'tv', 'wearable'],
  description: 'Bundle identifiers must be reverse-DNS and unique per customer.',
  run({ manifest }) {
    const findings: Finding[] = [];
    for (const [name, spec] of Object.entries(manifest.targets ?? {})) {
      const bid = (spec.config as { bundleId?: string } | undefined)?.bundleId;
      if (!bid) continue;
      if (!BUNDLE_RE.test(bid)) {
        findings.push({
          ruleId: this.id,
          severity: 'error',
          targetId: name,
          path: `targets.${name}.config.bundleId`,
          message: `bundleId "${bid}" is not valid reverse-DNS`,
          fix: 'use a form like com.yourcompany.appname',
        });
      }
      if (/^com\.example\./.test(bid)) {
        findings.push({
          ruleId: this.id,
          severity: 'error',
          targetId: name,
          path: `targets.${name}.config.bundleId`,
          message: `"${bid}" uses the reserved com.example.* namespace — stores will reject`,
        });
      }
    }
    return findings;
  },
};
