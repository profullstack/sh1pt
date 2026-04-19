import type { Rule, Finding } from '../rule.js';

// Placeholder — real implementation probes artifact directories per target
// kind and verifies every required icon/screenshot size is present.
export const iconSizes: Rule = {
  id: 'assets/icon-sizes',
  appliesTo: ['mobile', 'tv', 'wearable', 'desktop', 'browser-ext'],
  description: 'Required icon and screenshot sizes must exist for the target store.',
  run() {
    return [
      {
        ruleId: 'assets/icon-sizes',
        severity: 'info',
        message: '[stub] icon/screenshot size probe not yet implemented',
      },
    ];
  },
};
