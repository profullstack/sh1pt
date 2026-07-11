import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { planRemoteDiff, summarizeRemoteDiff, hasRemoteConflicts, UnsafeRepoPathError } from '../diff/plan.js';
import type { RenderResult } from '../action-pack/render.js';

function bodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function withHeader(packId: string, version: string, hash: string, body: string): string {
  // Mirror the real renderer: single-newline header, body straight after the
  // '# hash:' line (no blank line between header and body).
  return [
    '# Managed by sh1pt Actions Fleet',
    `# pack: ${packId}@${version}`,
    '# install: sh1pt-actions-store',
    `# hash: sha256:${hash}`,
    '',
  ].join('\n') + body;
}

function singleFileRender(hash: string): RenderResult {
  return {
    packId: 'test-pack',
    packVersion: '1.0.0',
    files: [
      {
        source: 'ci.yml.hbs',
        destination: '.github/workflows/ci.yml',
        mergeStrategy: 'replace-managed',
        content: withHeader('test-pack', '1.0.0', hash, 'name: CI\n'),
        hash,
      },
    ],
  };
}

describe('planRemoteDiff', () => {
  const body = 'name: CI\n';
  const hash = bodyHash(body);

  it('marks create when file does not exist on the base ref', async () => {
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: singleFileRender(hash),
      readExisting: async () => null,
    });
    expect(plan.files[0]?.status.kind).toBe('create');
    expect(plan.files[0]?.existingSha).toBeNull();
  });

  it('marks unchanged when body matches and managed by same pack', async () => {
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: singleFileRender(hash),
      readExisting: async () => ({
        content: withHeader('test-pack', '1.0.0', hash, body),
        sha: 'abc123',
      }),
    });
    expect(plan.files[0]?.status.kind).toBe('unchanged');
    expect(plan.files[0]?.existingSha).toBe('abc123');
  });

  it('marks update-managed when body changes but pack matches', async () => {
    const oldBody = 'name: OLD\n';
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: singleFileRender(hash),
      readExisting: async () => ({
        content: withHeader('test-pack', '0.9.0', bodyHash(oldBody), oldBody),
        sha: 'old-sha',
      }),
    });
    expect(plan.files[0]?.status.kind).toBe('update-managed');
    expect(plan.files[0]?.existingSha).toBe('old-sha');
  });

  it('marks conflict-unmanaged when file lacks managed header', async () => {
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: singleFileRender(hash),
      readExisting: async () => ({ content: 'hand-written ci\n', sha: 'unmanaged-sha' }),
    });
    expect(plan.files[0]?.status.kind).toBe('conflict-unmanaged');
    expect(plan.files[0]?.existingSha).toBe('unmanaged-sha');
  });

  it('marks conflict-other-pack when managed by a different pack', async () => {
    const otherBody = 'other body\n';
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: singleFileRender(hash),
      readExisting: async () => ({
        content: withHeader('other-pack', '2.0.0', bodyHash(otherBody), otherBody),
        sha: 'other-sha',
      }),
    });
    const status = plan.files[0]?.status;
    expect(status?.kind).toBe('conflict-other-pack');
    if (status?.kind === 'conflict-other-pack') {
      expect(status.existingPackId).toBe('other-pack');
    }
  });

  it('summarizes correctly across mixed statuses', async () => {
    const plan = await planRemoteDiff({
      owner: 'acme',
      repo: 'app',
      baseRef: 'main',
      render: {
        packId: 'test-pack',
        packVersion: '1.0.0',
        files: [
          {
            source: 'a.hbs',
            destination: '.github/workflows/a.yml',
            mergeStrategy: 'replace-managed',
            content: 'x',
            hash: 'h1',
          },
          {
            source: 'b.hbs',
            destination: '.github/workflows/b.yml',
            mergeStrategy: 'replace-managed',
            content: 'y',
            hash: 'h2',
          },
        ],
      },
      readExisting: async (path) => (path.endsWith('a.yml') ? { content: 'hand-written', sha: 'x' } : null),
    });
    const s = summarizeRemoteDiff(plan);
    expect(s.create).toBe(1);
    expect(s.conflict).toBe(1);
    expect(hasRemoteConflicts(plan)).toBe(true);
  });

  it('rejects remote file destinations that escape the repo', async () => {
    await expect(
      planRemoteDiff({
        owner: 'acme',
        repo: 'app',
        baseRef: 'main',
        render: {
          ...singleFileRender(hash),
          files: [
            {
              source: 'escape.hbs',
              destination: '../outside.yml',
              mergeStrategy: 'replace-managed',
              content: 'x',
              hash: 'h1',
            },
          ],
        },
        readExisting: async () => null,
      }),
    ).rejects.toThrow(UnsafeRepoPathError);
  });
});
