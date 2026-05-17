import { defineSocial, oauthSetup, type SocialPost } from '@profullstack/sh1pt-core';

// Bluesky — AT Protocol. Auth via app password (Settings → App Passwords
// in the Bluesky app; do NOT use the main account password). Endpoint:
// com.atproto.repo.createRecord on the user's PDS.
interface Config {
  handle: string;              // e.g. 'alice.bsky.social'
  pds?: string;                // default 'https://bsky.social'
}

interface BlueskyErrorResponse {
  error?: string;
  message?: string;
}

interface CreateSessionResponse extends BlueskyErrorResponse {
  did?: string;
  accessJwt?: string;
}

interface CreateRecordResponse extends BlueskyErrorResponse {
  uri?: string;
  cid?: string;
}

export default defineSocial<Config>({
  id: 'social-bluesky',
  label: 'Bluesky (AT Protocol)',
  requires: { maxBodyChars: 300, maxHashtags: 10, hashtagsInBody: true },
  async connect(ctx, config) {
    if (!ctx.secret('BLUESKY_APP_PASSWORD')) throw new Error('BLUESKY_APP_PASSWORD not in vault (create in Settings → App Passwords)');
    return { accountId: config.handle };
  },
  async post(ctx, post, config) {
    const appPassword = ctx.secret('BLUESKY_APP_PASSWORD');
    if (!appPassword) throw new Error('BLUESKY_APP_PASSWORD not in vault (create in Settings → App Passwords)');
    const pds = normalizePds(config.pds);
    ctx.log(`bluesky post · @${config.handle} · ${post.body.length} chars`);
    if (ctx.dryRun) return { id: 'dry-run', url: `https://bsky.app/profile/${config.handle}`, platform: 'bluesky', publishedAt: new Date().toISOString() };

    const session = await createSession(pds, config.handle, appPassword);
    if (!session.did || !session.accessJwt) throw new Error('Bluesky createSession response did not include did and accessJwt');
    const record = await createPostRecord(pds, session.did, session.accessJwt, post);
    if (!record.uri) throw new Error('Bluesky createRecord response did not include a record URI');

    return {
      id: record.uri,
      url: postUrl(config.handle, record.uri),
      platform: 'bluesky',
      publishedAt: new Date().toISOString(),
    };
  },

  setup: oauthSetup({
    secretKey: "BLUESKY_APP_PASSWORD",
    label: "Bluesky",
    vendorDocUrl: "https://bsky.app/settings/app-passwords",
    steps: [
      "Open bsky.app \u2192 Settings \u2192 App Passwords \u2192 Add App Password",
      "Copy the generated app password (shown once)",
      "Use your handle (e.g. you.bsky.social) as the username",
    ],
  }),
});

function normalizePds(pds = 'https://bsky.social'): string {
  return pds.replace(/\/$/, '');
}

function formatPostText(post: SocialPost): string {
  const link = post.link ? `\n${post.link}` : '';
  return `${post.body}${link}`.slice(0, 300);
}

async function createSession(pds: string, identifier: string, password: string): Promise<CreateSessionResponse> {
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await readJson<CreateSessionResponse>(res);
  if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
  return data;
}

async function createPostRecord(pds: string, repo: string, accessJwt: string, post: SocialPost): Promise<CreateRecordResponse> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      repo,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: formatPostText(post),
        createdAt: new Date().toISOString(),
      },
    }),
  });
  const data = await readJson<CreateRecordResponse>(res);
  if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
  return data;
}

async function readJson<T extends BlueskyErrorResponse>(res: Response): Promise<T> {
  try {
    return await res.json() as T;
  } catch {
    return { error: res.statusText } as T;
  }
}

function postUrl(handle: string, uri: string): string {
  const rkey = uri.split('/').pop();
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : `https://bsky.app/profile/${handle}`;
}
