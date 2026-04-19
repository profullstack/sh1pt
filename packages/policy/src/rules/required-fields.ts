import type { Rule, Finding } from '../rule.js';

export const requiredFields: Rule = {
  id: 'core/required-fields',
  description: 'Project must declare name, version, and at least one target.',
  run({ manifest }) {
    const findings: Finding[] = [];
    if (!manifest.name) findings.push({ ruleId: this.id, severity: 'error', path: 'name', message: 'name is required' });
    if (!manifest.version) findings.push({ ruleId: this.id, severity: 'error', path: 'version', message: 'version is required' });
    if (!Object.keys(manifest.targets ?? {}).length) {
      findings.push({ ruleId: this.id, severity: 'error', path: 'targets', message: 'at least one target must be declared', fix: 'sh1pt target add <id>' });
    }
    return findings;
  },
};
