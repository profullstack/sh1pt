import { describe, expect, it } from 'vitest';
import type { AutoblogArticle, AutoblogProvider } from '../autoblog.js';
import { fakeConnectContext, looksLikeVaultHint } from './harness.js';

export interface AutoblogContractOptions {
  sampleConfig: unknown;
  sampleArticle?: AutoblogArticle;
  requiredSecrets: string[];
}

export function contractTestAutoblog(provider: AutoblogProvider<any>, opts: AutoblogContractOptions): void {
  const article = opts.sampleArticle ?? {
    title: 'Launch notes',
    bodyMarkdown: 'A short article body.',
    tags: ['launch'],
  };

  describe(`AutoblogProvider contract · ${provider.id}`, () => {
    it('declares required fields', () => {
      expect(provider.id).toMatch(/^autoblog-[a-z][a-z0-9-]*$/);
      expect(provider.label).toBeTruthy();
      expect(provider.capabilities.webhook).toBe(true);
    });

    it('publish() throws vault-hint when the webhook URL secret is missing', async () => {
      const ctx = { ...fakeConnectContext({}), dryRun: false };
      await expect(provider.publish(ctx as any, article, opts.sampleConfig)).rejects.toSatisfy((e: unknown) =>
        e instanceof Error && looksLikeVaultHint(e),
      );
    });

    it('publish() dry-run returns ok without calling the network', async () => {
      const ctx = {
        secret: (key: string) => opts.requiredSecrets.includes(key) ? 'https://example.com/autoblog' : undefined,
        log: () => {},
        dryRun: true,
      };

      const result = await provider.publish(ctx as any, article, opts.sampleConfig);
      expect(result.provider).toBe(provider.id.replace(/^autoblog-/, ''));
      expect(result.status).toBe('dry-run');
      expect(result.url).toBe('https://example.com/autoblog');
    });
  });
}
