// App Manifest conversion callback. After the admin clicks "Create GitHub
// App" on the setup page, GitHub redirects here with a one-shot `code`
// that we exchange for the App's secrets. We don't persist any of it
// server-side — we render it once for the admin to copy into Railway,
// and never see it again.

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireAdminApi } from '@/lib/admin-guard';
import { convertAppManifest } from '@/lib/github-app';
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

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const code = request.nextUrl.searchParams.get('code');
  const base = await publicBase();
  if (!code) {
    return NextResponse.redirect(`${base}/admin/github/setup?error=missing_code`);
  }

  const result = await convertAppManifest(code);
  if (!result.ok || !result.data) {
    return NextResponse.redirect(
      `${base}/admin/github/setup?error=${encodeURIComponent(result.error ?? 'conversion_failed')}`,
    );
  }

  // Stash the secrets in the URL fragment — they never appear in our
  // server logs or analytics, and a tiny client component reads them
  // for the admin to copy into Railway.
  const params = new URLSearchParams({
    app_id: String(result.data.id),
    slug: result.data.slug,
    client_id: result.data.client_id,
    client_secret: result.data.client_secret,
    webhook_secret: result.data.webhook_secret ?? '',
    pem: result.data.pem,
    html_url: result.data.html_url,
    owner: result.data.owner.login,
  });
  return NextResponse.redirect(`${base}/admin/github/setup/done#${params.toString()}`);
}
