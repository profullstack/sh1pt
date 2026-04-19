import { describe, it, expect } from 'vitest';
import type { VcsProvider } from '../vcs.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface VcsContractOptions {
  sampleConfig: unknown;
  requiredSecrets: string[];
}

export function contractTestVcs(p: VcsProvider<any>, opts: VcsContractOptions): void {
  describe(`VcsProvider contract · ${p.id}`, () => {
    it('declares required fields', () => {
      expect(p.id).toMatch(/^vcs-[a-z][a-z0-9-]*$/);
      expect(p.label).toBeTruthy();
    });

    it('connect() throws vault-hint when secrets are missing', async () => {
      const ctx = fakeConnectContext({});
      await expect(p.connect(ctx as any, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('createRelease() returns a Release with tag + url', async () => {
      const ctx = fakeConnectContext(Object.fromEntries(opts.requiredSecrets.map((k) => [k, 'test'])));
      const release = await p.createRelease(ctx as any, { tag: 'v0.0.1-test' }, opts.sampleConfig);
      expect(release.tag).toBe('v0.0.1-test');
      expect(release.url).toMatch(/^https?:\/\//);
    });

    it('createPullRequest() returns a PR with url', async () => {
      const ctx = fakeConnectContext(Object.fromEntries(opts.requiredSecrets.map((k) => [k, 'test'])));
      const pr = await p.createPullRequest(ctx as any, {
        title: 'test PR', head: 'feature/x', base: 'main',
      }, opts.sampleConfig);
      expect(pr.number).toBeGreaterThan(0);
      expect(['open', 'merged', 'closed']).toContain(pr.state);
    });
  });
}
