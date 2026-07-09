import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// ugig.net — AI-powered gig marketplace for freelancers and agents.
// Auth: Bearer token from POST /api/auth/login (email + password).
// "Posting" maps to creating a Gig listing on ugig.net.
//
// API base: https://ugig.net/api
// Key endpoints:
//   POST /api/gigs          — create a gig
//   GET  /api/gigs          — list gigs
//   POST /api/applications  — apply to a gig
//   POST /api/auth/login    — authenticate (email + password)
//   GET  /api/profile       — get authenticated user profile
//
// Rate limits: not publicly documented; avoid bursting > ~10 req/min.

const UGIG_API = 'https://ugig.net/api';

interface Config {
  /** ugig.net username for logging/display (e.g. 'erica-ai') */
  username?: string;
  /** Default price in cents for gigs (0 = negotiate). */
  defaultPriceCents?: number;
  /** Default category for gigs: 'research'|'content-writing'|'seo'|'technical-documentation'|'data-analysis'|'code-review'|'other' */
  defaultCategory?: string;
}

export default defineSocial<Config>({
  id: 'social-ugig',
  label: 'uGig (Prompts Marketplace)',
  requires: { maxBodyChars: 10_000, maxHashtags: 10, hashtagsInBody: false },

  async connect(ctx, config) {
    const token = ctx.secret('UGIG_TOKEN');
    if (!token) throw new Error('UGIG_TOKEN not in vault — see setup()');

    const res = await fetch(`${UGIG_API}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`ugig auth check failed: HTTP ${res.status}`);
    const data = await res.json() as { profile?: { username?: string; id?: string }; username?: string; id?: string };
    const profile = data.profile ?? data;
    const username = profile.username ?? config.username ?? 'ugig';
    ctx.log(`ugig connected · @${username}`);
    return { accountId: username };
  },

  async post(ctx, post, config) {
    const token = ctx.secret('UGIG_TOKEN');
    if (!token) throw new Error('UGIG_TOKEN not in vault');

    const title = post.title ?? post.body.slice(0, 80).replace(/\n/g, ' ');
    const tags = (post.hashtags ?? []).slice(0, 10);
    const category = config.defaultCategory ?? 'research';
    const priceCents = config.defaultPriceCents ?? 0;

    ctx.log(`ugig gig · "${title}" · ${post.body.length} chars · ${tags.length} tags`);

    if (ctx.dryRun) {
      return { id: 'dry-run', url: 'https://ugig.net/gigs', platform: 'ugig', publishedAt: new Date().toISOString() };
    }

    const payload: Record<string, unknown> = {
      title,
      description: post.body.slice(0, 300),
      content: post.link ? `${post.body}\n\n${post.link}` : post.body,
      category,
      tags,
      price_cents: priceCents,
      status: 'active',
    };

    const res = await fetch(`${UGIG_API}/gigs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ugig post failed: HTTP ${res.status} — ${err}`);
    }

    const data = await res.json() as { id?: string; slug?: string; gig?: { id?: string; slug?: string } };
    const gig = data.gig ?? data;
    const id = gig.id ?? `ugig_${Date.now()}`;
    const slug = gig.slug ?? id;
    const url = `https://ugig.net/gigs/${slug}`;

    ctx.log(`ugig published · ${url}`);
    return { id, url, platform: 'ugig', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'UGIG_TOKEN',
    label: 'uGig',
    vendorDocUrl: 'https://ugig.net',
    steps: [
      'Register at https://ugig.net (email + password)',
      'Obtain Bearer token: POST https://ugig.net/api/auth/login body={"email":"…","password":"…"}',
      'Copy access_token from the JSON response',
      'Store it as UGIG_TOKEN in your sh1pt secrets vault',
      'Optionally set defaultCategory (research|content-writing|seo|technical-documentation|other) and defaultPriceCents in config',
    ],
  }),
});
