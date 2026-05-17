import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdminApi } from '@/lib/admin-guard';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function GET(_req: NextRequest) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blog_integrations')
    .select('id, name, kind, access_token, created_at, last_used_at, request_count')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 });
  }
  return NextResponse.json({ integrations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    body = {};
  }
  const name = (body.name || 'Crawlproof').trim().slice(0, 100);
  const accessToken = `cp_lx_${randomBytes(32).toString('base64url')}`;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blog_integrations')
    .insert({ name, kind: 'crawlproof', access_token: accessToken, created_by: guard.id })
    .select('id, name, kind, access_token, created_at, last_used_at, request_count')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create integration' }, { status: 500 });
  }
  return NextResponse.json({ integration: data });
}
