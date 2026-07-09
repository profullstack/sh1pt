export type SocialFollowAction = 'follow' | 'unfollow';
export type SocialFollowPlatform = 'bluesky';
export type SocialFollowSource = 'profile' | 'follows' | 'followers';

export interface SocialFollowTarget {
  platform: SocialFollowPlatform;
  actor: string;
  source: SocialFollowSource;
}

export interface SocialFollowActor {
  did: string;
  handle: string;
  displayName?: string;
}

export interface BlueskyFollowOptions {
  action: SocialFollowAction;
  account?: string;
  appPassword?: string;
  pds?: string;
  max: number;
  delayMs: number;
  dryRun?: boolean;
  log?: (message: string) => void;
  fetch?: typeof fetch;
}

export interface SocialFollowResult {
  platform: SocialFollowPlatform;
  action: SocialFollowAction;
  source: SocialFollowSource;
  actor: string;
  scanned: number;
  changed: number;
  skipped: number;
  dryRun: boolean;
}

interface BlueskyErrorResponse {
  error?: string;
  message?: string;
}

interface BlueskySession extends BlueskyErrorResponse {
  did?: string;
  accessJwt?: string;
}

interface BlueskyProfileResponse extends BlueskyErrorResponse {
  did?: string;
  handle?: string;
  displayName?: string;
}

interface BlueskyActorsResponse extends BlueskyErrorResponse {
  follows?: SocialFollowActor[];
  followers?: SocialFollowActor[];
  cursor?: string;
}

interface BlueskyRecordsResponse extends BlueskyErrorResponse {
  records?: Array<{
    uri: string;
    value?: {
      subject?: string;
    };
  }>;
  cursor?: string;
}

interface BlueskyCreateRecordResponse extends BlueskyErrorResponse {
  uri?: string;
}

export function parseSocialFollowTarget(input: string, explicitPlatform?: string): SocialFollowTarget {
  input = input.trim();
  const platform = normalizePlatform(explicitPlatform);
  if (platform && platform !== 'bluesky') {
    throw new Error(`social follow only supports Bluesky URLs today; got --platform ${explicitPlatform}`);
  }

  let url: URL | undefined;
  try {
    url = new URL(input);
  } catch {
    if (platform === 'bluesky' || looksLikeBlueskyActor(input)) {
      return { platform: 'bluesky', actor: input.replace(/^@/, ''), source: 'profile' };
    }
    throw new Error(`Expected a social account URL; got "${input}"`);
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'bsky.app' && host !== 'www.bsky.app') {
    throw new Error(`social follow only supports bsky.app URLs today; got ${host}`);
  }

  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new Error(`Could not parse Bluesky profile URL ${input}`);
  }
  const profileIndex = segments.indexOf('profile');
  const actor = profileIndex >= 0 ? segments[profileIndex + 1] : undefined;
  if (!actor) throw new Error(`Could not find a Bluesky profile handle or DID in ${input}`);

  const tab = segments[profileIndex + 2];
  const source: SocialFollowSource =
    tab === 'follows' ? 'follows' :
    tab === 'followers' ? 'followers' :
    'profile';

  return { platform: 'bluesky', actor, source };
}

export function normalizeFollowAction(action: string | undefined, unfollow = false): SocialFollowAction {
  if (unfollow) return 'unfollow';
  const normalized = (action ?? 'follow').trim().toLowerCase();
  if (normalized === 'follow' || normalized === 'unfollow') return normalized;
  throw new Error(`Expected --action follow or --action unfollow; got "${action}"`);
}

export async function runBlueskySocialFollow(input: string, opts: BlueskyFollowOptions): Promise<SocialFollowResult> {
  if (!Number.isInteger(opts.max) || opts.max < 1) throw new Error('--max must be a positive integer');
  if (!Number.isInteger(opts.delayMs) || opts.delayMs < 0) throw new Error('--delay-ms must be zero or a positive integer');

  const target = parseSocialFollowTarget(input, 'bluesky');
  const pds = normalizePds(opts.pds);
  const fetcher = opts.fetch ?? fetch;
  const log = opts.log ?? (() => {});
  const dryRun = !!opts.dryRun;

  const candidates = await collectBlueskyActors(fetcher, pds, target, opts.max);
  log(`found ${candidates.length} candidate account${candidates.length === 1 ? '' : 's'} from ${target.actor}/${target.source}`);

  if (dryRun) {
    for (const actor of candidates) {
      log(`dry-run: would ${opts.action} @${actor.handle} (${actor.did})`);
    }
    return {
      platform: 'bluesky',
      action: opts.action,
      source: target.source,
      actor: target.actor,
      scanned: candidates.length,
      changed: 0,
      skipped: 0,
      dryRun: true,
    };
  }

  if (!opts.account) throw new Error('Bluesky account handle missing; run `sh1pt promote social setup --platform bluesky` or pass --account');
  if (!opts.appPassword) throw new Error('BLUESKY_APP_PASSWORD missing; run `sh1pt promote social setup --platform bluesky`');

  const session = await createBlueskySession(fetcher, pds, opts.account, opts.appPassword);
  if (!session.did || !session.accessJwt) throw new Error('Bluesky createSession response did not include did and accessJwt');

  const existing = await listOwnFollowRecords(fetcher, pds, session.did, session.accessJwt);
  let changed = 0;
  let skipped = 0;

  for (const actor of candidates) {
    if (actor.did === session.did) {
      skipped += 1;
      log(`skip @${actor.handle}: this is the authenticated account`);
      continue;
    }

    const existingRecord = existing.get(actor.did);
    if (opts.action === 'follow') {
      if (existingRecord) {
        skipped += 1;
        log(`skip @${actor.handle}: already following`);
        continue;
      }
      const created = await createFollowRecord(fetcher, pds, session.did, session.accessJwt, actor.did);
      if (!created.uri) throw new Error(`Bluesky follow response did not include a record URI for @${actor.handle}`);
      existing.set(actor.did, created.uri);
      changed += 1;
      log(`followed @${actor.handle}`);
    } else {
      if (!existingRecord) {
        skipped += 1;
        log(`skip @${actor.handle}: not currently following`);
        continue;
      }
      await deleteFollowRecord(fetcher, pds, session.did, session.accessJwt, existingRecord);
      existing.delete(actor.did);
      changed += 1;
      log(`unfollowed @${actor.handle}`);
    }

    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  return {
    platform: 'bluesky',
    action: opts.action,
    source: target.source,
    actor: target.actor,
    scanned: candidates.length,
    changed,
    skipped,
    dryRun: false,
  };
}

function normalizePlatform(platform: string | undefined): SocialFollowPlatform | undefined {
  if (!platform) return undefined;
  const normalized = platform.replace(/^social-/, '').toLowerCase();
  return normalized === 'bluesky' || normalized === 'bsky' ? 'bluesky' : normalized as SocialFollowPlatform;
}

function looksLikeBlueskyActor(input: string): boolean {
  const actor = input.replace(/^@/, '');
  return actor.startsWith('did:') || /^[a-z0-9][a-z0-9.-]*\.[a-z][a-z0-9.-]*$/i.test(actor);
}

function normalizePds(pds = 'https://bsky.social'): string {
  return pds.replace(/\/$/, '');
}

async function collectBlueskyActors(
  fetcher: typeof fetch,
  pds: string,
  target: SocialFollowTarget,
  max: number,
): Promise<SocialFollowActor[]> {
  if (target.source === 'profile') {
    const actor = await getBlueskyProfile(fetcher, pds, target.actor);
    return [actor];
  }

  const actors: SocialFollowActor[] = [];
  let cursor: string | undefined;
  while (actors.length < max) {
    const remaining = max - actors.length;
    const endpoint = target.source === 'followers' ? 'app.bsky.graph.getFollowers' : 'app.bsky.graph.getFollows';
    const key = target.source === 'followers' ? 'followers' : 'follows';
    const url = new URL(`${pds}/xrpc/${endpoint}`);
    url.searchParams.set('actor', target.actor);
    url.searchParams.set('limit', String(Math.min(100, remaining)));
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchJson<BlueskyActorsResponse>(fetcher, url.toString());
    const page = data[key] ?? [];
    actors.push(...page.filter((actor) => actor.did && actor.handle));
    cursor = data.cursor;
    if (!cursor || page.length === 0) break;
  }
  return actors.slice(0, max);
}

async function getBlueskyProfile(fetcher: typeof fetch, pds: string, actor: string): Promise<SocialFollowActor> {
  const url = new URL(`${pds}/xrpc/app.bsky.actor.getProfile`);
  url.searchParams.set('actor', actor);
  const data = await fetchJson<BlueskyProfileResponse>(fetcher, url.toString());
  if (!data.did || !data.handle) throw new Error(`Could not resolve Bluesky actor "${actor}"`);
  return { did: data.did, handle: data.handle, displayName: data.displayName };
}

async function createBlueskySession(fetcher: typeof fetch, pds: string, identifier: string, password: string): Promise<BlueskySession> {
  return fetchJson<BlueskySession>(fetcher, `${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
}

async function listOwnFollowRecords(
  fetcher: typeof fetch,
  pds: string,
  repo: string,
  accessJwt: string,
): Promise<Map<string, string>> {
  const records = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', repo);
    url.searchParams.set('collection', 'app.bsky.graph.follow');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchJson<BlueskyRecordsResponse>(fetcher, url.toString(), {
      headers: { authorization: `Bearer ${accessJwt}` },
    });
    for (const record of data.records ?? []) {
      const subject = record.value?.subject;
      if (subject) records.set(subject, record.uri);
    }
    cursor = data.cursor;
  } while (cursor);
  return records;
}

async function createFollowRecord(
  fetcher: typeof fetch,
  pds: string,
  repo: string,
  accessJwt: string,
  subject: string,
): Promise<BlueskyCreateRecordResponse> {
  return fetchJson<BlueskyCreateRecordResponse>(fetcher, `${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      repo,
      collection: 'app.bsky.graph.follow',
      record: {
        $type: 'app.bsky.graph.follow',
        subject,
        createdAt: new Date().toISOString(),
      },
    }),
  });
}

async function deleteFollowRecord(
  fetcher: typeof fetch,
  pds: string,
  repo: string,
  accessJwt: string,
  uri: string,
): Promise<void> {
  const rkey = uri.split('/').pop();
  if (!rkey) throw new Error(`Could not extract follow record key from ${uri}`);
  await fetchJson<BlueskyErrorResponse>(fetcher, `${pds}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      repo,
      collection: 'app.bsky.graph.follow',
      rkey,
    }),
  });
}

async function fetchJson<T extends BlueskyErrorResponse>(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetcher(url, init);
  let data: T;
  try {
    data = await res.json() as T;
  } catch {
    data = { error: res.statusText } as T;
  }
  if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
