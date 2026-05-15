import { createHmac } from 'node:crypto';
import {
  defineAutoblog,
  webhookUrlSetup,
  type AutoblogArticle,
  type AutoblogPublishMode,
  type AutoblogResult,
  type AutoblogStatus,
} from '@profullstack/sh1pt-core';

interface Config {
  webhookUrlKey?: string;
  secretKey?: string;
  projectId?: string;
  collection?: string;
  publishMode?: AutoblogPublishMode;
}

const PROVIDER = 'crawlproof';
const DEFAULT_URL_KEY = 'CRAWLPROOF_WEBHOOK_URL';
const DEFAULT_SECRET_KEY = 'CRAWLPROOF_WEBHOOK_SECRET';

export default defineAutoblog<Config>({
  id: 'autoblog-crawlproof',
  label: 'CrawlProof autoblog',
  capabilities: {
    webhook: true,
    secretSigning: true,
    draft: true,
    canonicalUrl: true,
    tags: true,
  },

  async publish(ctx, article, config): Promise<AutoblogResult> {
    const urlKey = config.webhookUrlKey ?? DEFAULT_URL_KEY;
    const url = ctx.secret(urlKey);
    if (!url) throw new Error(`${urlKey} not in vault — run: sh1pt secret set ${urlKey} <webhook-url>`);

    const submittedAt = new Date().toISOString();
    const payload = formatCrawlProofPayload(article, config, submittedAt);
    ctx.log(`crawlproof autoblog webhook · ${article.title}`);

    if (ctx.dryRun) {
      return { id: 'dry-run', provider: PROVIDER, status: 'dry-run', url, submittedAt };
    }

    const body = JSON.stringify(payload);
    const secret = ctx.secret(config.secretKey ?? DEFAULT_SECRET_KEY);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Sh1pt-Provider': PROVIDER,
        ...(secret ? { 'X-Sh1pt-Signature': sign(body, secret) } : {}),
      },
      body,
    });

    return readWebhookResult(res, url, submittedAt);
  },

  setup: webhookUrlSetup<Config>({
    secretKey: DEFAULT_URL_KEY,
    label: 'CrawlProof autoblog webhook',
    urlPrefix: 'https://',
    vendorDocUrl: 'https://crawlproof.com',
    steps: [
      'Create or open the CrawlProof autoblog webhook destination',
      'Copy its HTTPS webhook URL',
      'Optionally set CRAWLPROOF_WEBHOOK_SECRET so receivers can verify the X-Sh1pt-Signature header',
    ],
  }),
});

function formatCrawlProofPayload(article: AutoblogArticle, config: Config, submittedAt: string): Record<string, unknown> {
  return {
    source: 'sh1pt',
    provider: PROVIDER,
    projectId: config.projectId,
    collection: config.collection,
    publishMode: config.publishMode ?? 'draft',
    submittedAt,
    article: {
      title: article.title,
      markdown: article.bodyMarkdown,
      canonicalUrl: article.canonicalUrl,
      sourceUrl: article.sourceUrl,
      excerpt: article.excerpt,
      tags: article.tags ?? [],
      author: article.author,
      publishedAt: article.publishedAt,
      metadata: article.metadata,
    },
  };
}

async function readWebhookResult(res: Response, url: string, submittedAt: string): Promise<AutoblogResult> {
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    return {
      id: 'failed',
      provider: PROVIDER,
      status: 'failed',
      url,
      submittedAt,
      responseStatus: res.status,
      error: text || res.statusText,
    };
  }

  const data = parseJson(text);
  return {
    id: String(data.id ?? data.jobId ?? data.requestId ?? 'queued'),
    provider: PROVIDER,
    status: normalizeStatus(data.status),
    url: typeof data.url === 'string' ? data.url : url,
    submittedAt,
    responseStatus: res.status,
  };
}

function parseJson(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeStatus(status: unknown): AutoblogStatus {
  const value = String(status ?? '').toLowerCase();
  if (value === 'published') return 'published';
  if (value === 'failed') return 'failed';
  return 'queued';
}

function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
