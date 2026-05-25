import { describe, expect, it } from 'vitest';
import { actionsCmd, auditWorkflowContent } from './build-actions.js';

describe('actions command aliases', () => {
  it('supports `info` as an alias for `show`', () => {
    const showCmd = actionsCmd.commands.find((c) => c.name() === 'show');
    expect(showCmd).toBeDefined();
    expect(showCmd?.aliases()).toContain('info');
  });
});

describe('auditWorkflowContent', () => {
  it('detects unsafe patterns', () => {
    const findings = auditWorkflowContent('workflow.yml', `
name: Test
on:
  pull_request_target:
permissions: write-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - run: curl https://example.com/install.sh | bash
      - run: wget https://example.com/install.sh | sh
      - run: echo ok
    container:
      image: node:22
`);

    expect(findings.map((f) => f.rule)).toEqual(expect.arrayContaining([
      'write-all-permissions',
      'pull-request-target',
      'unpinned-action-branch',
      'curl-pipe-bash',
      'wget-pipe-bash',
      'unpinned-docker-image',
    ]));
  });

  it('does not report findings for a safer workflow', () => {
    const findings = auditWorkflowContent('workflow.yml', `
name: Safe
on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test
`);

    expect(findings).toHaveLength(0);
  });
});
