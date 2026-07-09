import { describe, expect, it } from 'vitest';
import { auditWorkflowContent, createActionsCmd } from './build-actions.js';

describe('actions command aliases', () => {
  const actionsCmd = createActionsCmd();
  it('supports `info` as an alias for `show`', () => {
    const showCmd = actionsCmd.commands.find((c) => c.name() === 'show');
    expect(showCmd).toBeDefined();
    expect(showCmd?.aliases()).toContain('info');
  });

  it('supports a search subcommand for pack discovery', () => {
    const searchCmd = actionsCmd.commands.find((c) => c.name() === 'search');
    expect(searchCmd).toBeDefined();
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

  it('detects unpinned shorthand job container images', () => {
    const findings = auditWorkflowContent('workflow.yml', `
name: Container
on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    container: node:22
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test
`);

    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'unpinned-docker-image',
      message: 'image node:22 is not pinned to a digest',
    }));
  });
});
