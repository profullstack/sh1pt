import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

const LINKEDIN_ACCESS_TOKEN_SECRET = 'LINKEDIN_ACCESS_TOKEN';
const LINKEDIN_AUTHOR_URN_SECRET = 'LINKEDIN_AUTHOR_URN';
const DEFAULT_LINKEDIN_VERSION = '202605';

// LinkedIn API. Prefer the versioned Posts API; keep the legacy UGC
// endpoint available for apps that have not migrated yet.
interface Config {
  authorUrn?: string;          // urn:li:person:ID or urn:li:organization:ID for pages
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  api?: 'posts' | 'ugc';
  linkedinVersion?: string;    // YYYYMM; required by the versioned /rest/posts API
  feedDistribution?: 'MAIN_FEED' | 'NONE';
  reshareUrn?: string;
  rootReshareUrn?: string;
}

interface LinkedinError {
  message?: string;
  serviceErrorCode?: number;
  status?: number;
}

export default defineSocial<Config>({
  id: 'social-linkedin',
  label: 'LinkedIn',
  requires: { maxBodyChars: 3000, maxHashtags: 30, hashtagsInBody: true },

  async connect(ctx, config) {
    if (!ctx.secret(LINKEDIN_ACCESS_TOKEN_SECRET)) {
      throw new Error(`${LINKEDIN_ACCESS_TOKEN_SECRET} not in vault - run: sh1pt secret set ${LINKEDIN_ACCESS_TOKEN_SECRET} <access-token>`);
    }
    return { accountId: config.authorUrn ?? ctx.secret(LINKEDIN_AUTHOR_URN_SECRET) ?? 'linkedin' };
  },

  async post(ctx, post, config) {
    if (post.media?.length) throw new Error('LinkedIn media uploads are not implemented yet; upload assets first and use a future media-aware adapter path');
    const token = ctx.secret(LINKEDIN_ACCESS_TOKEN_SECRET);
    if (!token) throw new Error(`${LINKEDIN_ACCESS_TOKEN_SECRET} not in vault - run: sh1pt secret set ${LINKEDIN_ACCESS_TOKEN_SECRET} <access-token>`);
    const authorUrn = config.authorUrn ?? ctx.secret(LINKEDIN_AUTHOR_URN_SECRET);
    if (!authorUrn) throw new Error(`${LINKEDIN_AUTHOR_URN_SECRET} not in vault and authorUrn was not configured`);
    const commentary = formatCommentary(post);
    ctx.log(`linkedin post · ${config.api ?? 'posts'} · ${authorUrn} · ${commentary.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: 'https://www.linkedin.com/', platform: 'linkedin', publishedAt: new Date().toISOString() };

    const id = config.api === 'ugc'
      ? await createUgcPost(token, authorUrn, commentary, config)
      : await createRestPost(token, authorUrn, commentary, config);
    return {
      id,
      url: linkedinPostUrl(id),
      platform: 'linkedin',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: LINKEDIN_ACCESS_TOKEN_SECRET,
    label: "LinkedIn",
    vendorDocUrl: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin",
    steps: [
      "Create a LinkedIn app and add Share on LinkedIn or the relevant Marketing API product",
      "Request w_member_social for member posts or w_organization_social for organization posts",
      "Store the OAuth access token as LINKEDIN_ACCESS_TOKEN",
      "Store the author URN as LINKEDIN_AUTHOR_URN or configure authorUrn in sh1pt.config.ts",
    ],
  }),
});

function formatCommentary(post: SocialPost): string {
  const parts = [post.body];
  if (post.link) parts.push(post.link);
  const hashtags = (post.hashtags ?? [])
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((tag) => `#${tag}`)
    .join(' ');
  if (hashtags) parts.push(hashtags);
  const commentary = parts.filter(Boolean).join('\n\n');
  return commentary.length > 3000 ? `${commentary.slice(0, 2997)}...` : commentary;
}

async function createRestPost(token: string, authorUrn: string, commentary: string, config: Config): Promise<string> {
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': config.linkedinVersion ?? DEFAULT_LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary,
      visibility: config.visibility ?? 'PUBLIC',
      distribution: {
        feedDistribution: config.feedDistribution ?? 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(config.reshareUrn ? {
        reshareContext: {
          parent: config.reshareUrn,
          ...(config.rootReshareUrn ? { root: config.rootReshareUrn } : {}),
        },
      } : {}),
    }),
  });
  return await readLinkedinCreatedId(response, token);
}

async function createUgcPost(token: string, authorUrn: string, commentary: string, config: Config): Promise<string> {
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { attributes: [], text: commentary },
          shareMediaCategory: 'NONE',
          media: [],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': config.visibility ?? 'PUBLIC',
      },
      ...(config.reshareUrn ? { responseContext: { parent: config.reshareUrn } } : {}),
    }),
  });
  return await readLinkedinCreatedId(response, token);
}

async function readLinkedinCreatedId(response: Response, token: string): Promise<string> {
  if (!response.ok) throw new Error(redactToken(await readLinkedinError(response), token));
  const restliId = response.headers.get('x-restli-id');
  if (restliId) return restliId;
  const body = await response.text().catch(() => '');
  if (!body) throw new Error('LinkedIn create response did not include x-restli-id');
  try {
    const data = JSON.parse(body) as { id?: string; value?: { id?: string } };
    const id = data.id ?? data.value?.id;
    if (id) return id;
  } catch {
    // Fall through to the explicit error below.
  }
  throw new Error('LinkedIn create response did not include x-restli-id or id');
}

async function readLinkedinError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return response.statusText;
  try {
    const data = JSON.parse(text) as LinkedinError;
    return data.message ?? text;
  } catch {
    return text;
  }
}

function redactToken(message: string, token: string): string {
  return message.replaceAll(token, '[redacted]');
}

function linkedinPostUrl(id: string): string {
  return `https://www.linkedin.com/feed/update/${id}/`;
}
