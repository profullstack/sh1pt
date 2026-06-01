import { describe, it, expect } from 'vitest';
import { bundleId } from './bundle-id.js';
import type { Finding, LintContext } from '../rule.js';

function lint(bid: string): Finding[] {
  const ctx = {
    projectDir: '/tmp/project',
    manifest: {
      targets: {
        ios: { use: 'ios', enabled: true, config: { bundleId: bid } },
      },
    },
  } as unknown as LintContext;
  return bundleId.run(ctx) as Finding[];
}

describe('bundle-id rule', () => {
  it('accepts a valid reverse-DNS id', () => {
    expect(lint('com.yourcompany.appname')).toHaveLength(0);
  });

  it('accepts an internal hyphen inside a label', () => {
    expect(lint('com.your-company.app-name')).toHaveLength(0);
  });

  it('rejects a trailing hyphen (Apple/Google reject it)', () => {
    const findings = lint('com.foo.bar-');
    expect(findings.some((f) => /not valid reverse-DNS/.test(f.message))).toBe(true);
  });

  it('rejects a label that starts with a hyphen', () => {
    const findings = lint('com.-foo.bar');
    expect(findings.some((f) => /not valid reverse-DNS/.test(f.message))).toBe(true);
  });

  it('rejects a single-segment id (not reverse-DNS)', () => {
    const findings = lint('com');
    expect(findings.some((f) => /not valid reverse-DNS/.test(f.message))).toBe(true);
  });
});
