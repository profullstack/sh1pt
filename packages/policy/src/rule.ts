import type { Manifest, TargetKind } from '@profullstack/sh1pt-core';

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  ruleId: string;
  severity: Severity;
  targetId?: string;
  path?: string;
  message: string;
  fix?: string;
}

export interface LintContext {
  manifest: Manifest;
  projectDir: string;
  // existing listings across the user's account — used for uniqueness checks
  existingListings?: { store: string; title: string; bundleId?: string }[];
}

export interface Rule {
  id: string;
  description: string;
  // empty = applies to every target kind
  appliesTo?: TargetKind[];
  run(ctx: LintContext): Finding[] | Promise<Finding[]>;
}

export interface LintResult {
  findings: Finding[];
  errors: number;
  warnings: number;
  passed: boolean;
}
