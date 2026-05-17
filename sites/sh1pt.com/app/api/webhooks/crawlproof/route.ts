// Crawlproof Autoblog webhook receiver — backed by @profullstack/autoblog.
//
// Contract: https://crawlproof.com/docs/autoblog-webhook
// Wire format: CloudEvents 1.0 envelope + Standard Webhooks signing.
//
// Token is stored in blog_integrations(kind='crawlproof'). The bearer
// doubles as the HMAC secret — we look up the integration by bearer,
// then hand body + headers + secret to the SDK which re-checks the
// bearer, verifies the signature, and parses the envelope.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { verifyAndParse } from '@profullstack/autoblog';
import { gatePost } from '@profullstack/autoblog/quality';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { SITE_URL } from '@/lib/blog';
import { pingWebSubHub } from '@/lib/websub';

function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: integrations, error: lookupErr } = await supabase
    .from('blog_integrations')
    .select(
      'id, access_token, allowed_niches, min_word_count, max_link_density, banned_terms, min_quality_score',
    )
    .eq('kind', 'crawlproof');
  if (lookupErr) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  const integration = (integrations ?? []).find((row) =>
    tokensMatch(row.access_token, bearer),
  );
  if (!integration) {
    return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const parsed = verifyAndParse({
    headers,
    body,
    opts: { secret: integration.access_token },
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: parsed.status });
  }

  const gate = await gatePost(parsed.post, {
    allowedNiches: (integration as any).allowed_niches ?? [],
    heuristics: {
      minWordCount: (integration as any).min_word_count ?? 500,
      maxLinkDensity: (integration as any).max_link_density ?? 1.0,
      bannedTerms: (integration as any).banned_terms ?? [],
    },
    minQualityScore: (integration as any).min_quality_score ?? undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? undefined,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: `gate ${gate.stage} reject`, reasons: gate.reasons },
      { status: gate.stage === 'niche' ? 403 : 422 },
    );
  }

  const { post } = parsed;
  const row = {
    source: 'crawlproof',
    source_id: post.id,
    slug: post.slug,
    title: post.title,
    content_markdown: post.markdown ?? null,
    content_html: post.html,
    meta_description: post.excerpt ?? null,
    image_url: post.featured_image?.url ?? null,
    tags: post.tags,
    source_created_at: post.published_at,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('blog_posts')
    .upsert([row], { onConflict: 'source,source_id' });
  if (upsertErr) {
    console.error('[crawlproof webhook] upsert failed:', upsertErr);
    return NextResponse.json({ error: 'Failed to persist article' }, { status: 500 });
  }

  try {
    await supabase.rpc('bump_blog_integration', { integration_id: integration.id });
  } catch {
    // best-effort
  }

  void pingWebSubHub(`${SITE_URL}/blog/rss.xml`);

  return NextResponse.json({ message: 'Webhook processed successfully', slug: post.slug });
}
