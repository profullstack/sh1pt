// GitHub App install callback. GitHub redirects users here after they
// install the App on their account / org. We look up the installation
// via the App JWT, persist the row tied to the signed-in user's profile,
// then bounce back to the dashboard.
//
// Query params from GitHub:
//   installation_id: number   — required, identifies the install
//   setup_action:    string   — 'install' | 'update' | 'request'

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getInstallation, isGithubAppConfigured } from '@/lib/github-app';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

async function publicBase(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1')) {
    return `${proto}://${host}`.replace(/\/$/, '');
  }
  return env.siteUrl.replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
  const base = await publicBase();
  const url = req.nextUrl;
  const installationIdRaw = url.searchParams.get('installation_id');
  const setupAction = url.searchParams.get('setup_action');

  // User must be signed in to bind this installation to their account.
  // Park them at login with this callback as the redirect so they come
  // back to the same query string after auth.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/api/github/installations/callback?${url.searchParams.toString()}`;
    return NextResponse.redirect(`${base}/login?next=${encodeURIComponent(next)}`);
  }

  if (!installationIdRaw || !/^\d+$/.test(installationIdRaw)) {
    return NextResponse.redirect(`${base}/dashboard/github?error=missing_installation`);
  }
  const installationId = Number.parseInt(installationIdRaw, 10);

  // "request" means the user asked for install access on a repo they
  // don't own — there's nothing for us to persist yet.
  if (setupAction === 'request') {
    return NextResponse.redirect(`${base}/dashboard/github?notice=install_requested`);
  }

  if (!isGithubAppConfigured()) {
    return NextResponse.redirect(`${base}/dashboard/github?error=app_not_configured`);
  }

  const lookup = await getInstallation(installationId);
  if (!lookup.ok || !lookup.data) {
    console.error('[gh-callback] installation lookup failed', lookup);
    return NextResponse.redirect(`${base}/dashboard/github?error=lookup_failed`);
  }
  const inst = lookup.data;

  const admin = getSupabaseServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>();
  if (!profile) {
    return NextResponse.redirect(`${base}/dashboard?error=no_profile`);
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await admin
    .from('github_installations')
    .upsert(
      {
        profile_id: profile.id,
        installation_id: installationId,
        account_login: inst.account.login,
        account_type: inst.account.type,
        account_avatar_url: inst.account.avatar_url ?? null,
        repository_selection: inst.repository_selection,
        permissions: inst.permissions,
        status: 'active',
        updated_at: now,
      },
      { onConflict: 'profile_id,installation_id' },
    );
  if (upsertErr) {
    console.error('[gh-callback] upsert failed', upsertErr);
    return NextResponse.redirect(`${base}/dashboard/github?error=persist_failed`);
  }

  return NextResponse.redirect(`${base}/dashboard/github?installed=1`);
}
