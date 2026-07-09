import { describe, expect, it } from 'vitest';
import { lint } from './linter.js';
import type { LintContext, Rule } from './rule.js';

describe('lint', () => {
  it('uses target map keys when applying target-kind scoped rules', async () => {
    const ctx: LintContext = {
      projectDir: '/tmp/sh1pt-test',
      manifest: {
        name: 'web-app',
        version: '1.0.0',
        channels: ['stable'],
        targets: {
          web: {
            use: 'web-static',
            enabled: true,
            config: { bundleId: 'not.a.mobile.target' },
          },
        },
      },
    };

    const mobileOnly: Rule = {
      id: 'mobile-only',
      description: 'runs only for mobile targets',
      appliesTo: ['mobile'],
      run: () => [{ ruleId: 'mobile-only', severity: 'error', message: 'should not run' }],
    };
    const universal: Rule = {
      id: 'universal',
      description: 'runs for all targets',
      run: () => [{ ruleId: 'universal', severity: 'info', message: 'ran' }],
    };

    const result = await lint(ctx, [mobileOnly, universal]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe('universal');
    expect(result.passed).toBe(true);
  });
});
