import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

// Openwork (openwork.bot) — Agent marketplace with competitive bidding.
// Auth: Bearer token (API key from agent registration).
// "Posting" maps to submitting work to an open job on Openwork.
//
// API base: https://www.openwork.bot/api
// Docs:     https://www.openwork.bot/api/docs
// Key endpoints:
//   POST /api/agents/register   — register a new agent
//   GET  /api/agents/me          — get authenticated agent profile
//   PATCH /api/agents/me         — update profile (webhook, specialties, etc.)
//   GET  /api/jobs               — list open jobs
//   GET  /api/jobs/:id           — get job details
//   POST /api/jobs/:id/submit    — submit work to a job
//   POST /api/agents/:id/hire    — directly hire an agent
//
// Rate limits: not documented; avoid bursting > ~10 req/min.

const OPENWORK_API = 'https://www.openwork.bot/api';

interface Config {
  /** Job ID to submit to. If set, post() submits work to this job. */
  jobId?: string;
  /** Agent specialties for profile updates: ['coding', 'research', 'writing'] */
  specialties?: string[];
  /** Short tagline for profile */
  description?: string;
}

export default defineSocial<Config>({
  id: 'social-openwork',
  label: 'Openwork',
  requires: { maxBodyChars: 10_000, maxHashtags: 10, hashtagsInBody: false },

  async connect(ctx, config) {
    const token = ctx.secret('OPENWORK_API_KEY');
    if (!token) throw new Error('OPENWORK_API_KEY not in vault — see setup()');

    const res = await fetch(`${OPENWORK_API}/agents/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`openwork auth check failed: HTTP ${res.status}`);
    const data = await res.json() as { id?: string; name?: string };
    const name = data.name ?? 'openwork-agent';
    ctx.log(`openwork connected · ${name}`);
    return { accountId: data.id ?? name };
  },

  async post(ctx, post, config) {
    const token = ctx.secret('OPENWORK_API_KEY');
    if (!token) throw new Error('OPENWORK_API_KEY not in vault');

    const jobId = config.jobId ?? post.title?.match(/job[:\s]+([a-f0-9-]+)/i)?.[1];
    if (!jobId) {
      throw new Error('openwork post requires a jobId in config — use config.jobId or include "job: <id>" in the title');
    }

    ctx.log(`openwork submit · job ${jobId} · ${post.body.length} chars`);

    if (ctx.dryRun) {
      return { id: 'dry-run', url: `https://www.openwork.bot/jobs/${jobId}`, platform: 'openwork', publishedAt: new Date().toISOString() };
    }

    const payload: Record<string, unknown> = {
      content: post.body,
    };

    // Attach link as an artifact if present
    if (post.link) {
      payload.artifacts = [{ type: 'url', url: post.link }];
    }

    // Attach tags as description context
    if (post.hashtags?.length) {
      payload.description = post.hashtags.join(', ');
    }

    const res = await fetch(`${OPENWORK_API}/jobs/${jobId}/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`openwork submit failed: HTTP ${res.status} — ${err}`);
    }

    const data = await res.json() as { submission?: { id?: string }; id?: string };
    const submissionId = data.submission?.id ?? data.id ?? `ow_${Date.now()}`;
    const url = `https://www.openwork.bot/jobs/${jobId}`;

    ctx.log(`openwork submitted · ${url}`);
    return { id: submissionId, url, platform: 'openwork', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'OPENWORK_API_KEY',
    label: 'Openwork',
    vendorDocUrl: 'https://www.openwork.bot/api/docs',
    steps: [
      'Go to https://www.openwork.bot and register an agent',
      'POST /api/agents/register with { name, profile, specialties } to get an API key',
      'Save the API key (shown once) — this is your Bearer token',
      'Store it as OPENWORK_API_KEY in your sh1pt secrets vault',
      'Optionally set config.jobId to target a specific job for submissions',
    ],
  }),
});