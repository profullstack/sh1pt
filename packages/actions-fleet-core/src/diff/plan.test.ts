import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planDiff,
  summarizeDiff,
  hasConflicts,
  parseManagedHeader,
  UnsafeRepoPathError,
} from './plan.js';
import type { RenderResult } from '../action-pack/render.js';

function bodyHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function makeRender(content: string, hash: string): RenderResult {
  return {
    packId: 'test-pack',
    packVersion: '1.0.0',
    files: [
      {
        source: 'ci.yml.hbs',
        destination: '.github/workflows/ci.yml',
        mergeStrategy: 'replace-managed',
        content,
        hash,
      },
    ],
  };
}

function withHeader(packId: string, version: string, hash: string, body: string): string {
  // Mirror the real renderer (buildManagedHeader + body): header lines joined
  // by single newlines, then the body immediately after the '# hash:' line —
  // no blank line between header and body.
  return [
    '# Managed by sh1pt Actions Fleet',
    `# pack: ${packId}@${version}`,
    '# install: sh1pt-actions-store',
    `# hash: sha256:${hash}`,
    '',
  ].join('\n') + body;
}

describe('parseManagedHeader', () => {
  it('parses a valid header', () => {
    const content = withHeader('foo', '1.2.3', 'a'.repeat(64), 'name: CI\n');
    const h = parseManagedHeader(content);
    expect(h?.packId).toBe('foo');
    expect(h?.packVersion).toBe('1.2.3');
    expect(h?.bodyHash).toBe('a'.repeat(64));
  });

  it('returns null when marker missing', () => {
    expect(parseManagedHeader('name: CI\n')).toBeNull();
  });

  it('returns null when pack line missing', () => {
    const broken = ['# Managed by sh1pt Actions Fleet', '# hash: sha256:' + 'a'.repeat(64), '', 'body'].join('\n');
    expect(parseManagedHeader(broken)).toBeNull();
  });
});

describe('planDiff', () => {
  const body = 'name: CI\n';
  const hash = bodyHash(body);
  const newContent = withHeader('test-pack', '1.0.0', hash, body);

  it('marks create when file does not exist', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: makeRender(newContent, hash),
        readExisting: async () => null,
      });
      expect(plan.files[0]?.status.kind).toBe('create');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('marks unchanged when body hash matches', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: makeRender(newContent, hash),
        readExisting: async () => withHeader('test-pack', '1.0.0', hash, body),
      });
      expect(plan.files[0]?.status.kind).toBe('unchanged');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('marks update-managed when same pack but body differs', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const oldBody = 'name: OLD\n';
      const plan = await planDiff({
        repoDir,
        render: makeRender(newContent, hash),
        readExisting: async () => withHeader('test-pack', '0.9.0', bodyHash(oldBody), oldBody),
      });
      expect(plan.files[0]?.status.kind).toBe('update-managed');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('marks conflict-unmanaged when file lacks managed header', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: makeRender(newContent, hash),
        readExisting: async () => 'name: existing CI\n',
      });
      expect(plan.files[0]?.status.kind).toBe('conflict-unmanaged');
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('marks conflict-other-pack when managed by a different pack', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const otherBody = 'body\n';
      const plan = await planDiff({
        repoDir,
        render: makeRender(newContent, hash),
        readExisting: async () => withHeader('other-pack', '2.0.0', bodyHash(otherBody), otherBody),
      });
      const s = plan.files[0]?.status;
      expect(s?.kind).toBe('conflict-other-pack');
      if (s?.kind === 'conflict-other-pack') {
        expect(s.existingPackId).toBe('other-pack');
      }
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects destinations that would escape the repo', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const render: RenderResult = {
        packId: 'test-pack',
        packVersion: '1.0.0',
        files: [
          {
            source: 'x.hbs',
            destination: '/etc/passwd',
            mergeStrategy: 'replace-managed',
            content: 'x',
            hash: 'a',
          },
        ],
      };
      await expect(
        planDiff({ repoDir, render, readExisting: async () => null }),
      ).rejects.toThrow(UnsafeRepoPathError);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});

describe('summarizeDiff + hasConflicts', () => {
  it('summarizes a mixed plan', async () => {
    const body = 'body\n';
    const hash = bodyHash(body);
    const newContent = withHeader('test-pack', '1.0.0', hash, body);
    const repoDir = await mkdtemp(join(tmpdir(), 'sh1pt-diff-'));
    try {
      const plan = await planDiff({
        repoDir,
        render: {
          packId: 'test-pack',
          packVersion: '1.0.0',
          files: [
            {
              source: 'a.hbs',
              destination: '.github/workflows/a.yml',
              mergeStrategy: 'replace-managed',
              content: newContent,
              hash,
            },
            {
              source: 'b.hbs',
              destination: '.github/workflows/b.yml',
              mergeStrategy: 'replace-managed',
              content: newContent,
              hash,
            },
          ],
        },
        readExisting: async (p) => (p.endsWith('a.yml') ? 'unmanaged\n' : null),
      });
      const s = summarizeDiff(plan);
      expect(s.create).toBe(1);
      expect(s.conflict).toBe(1);
      expect(hasConflicts(plan)).toBe(true);
    } finally {
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
