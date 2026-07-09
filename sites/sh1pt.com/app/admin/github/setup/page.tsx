import { headers } from 'next/headers';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-guard';
import { env } from '@/lib/env';

export const metadata = {
  title: 'Admin · Register GitHub App — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface ManifestPermissions {
  contents: 'write';
  workflows: 'write';
  pull_requests: 'write';
  metadata: 'read';
  actions: 'read';
}

/**
 * Derive the public base URL from the request, falling back to env.siteUrl.
 * Protects against a misconfigured NEXT_PUBLIC_SITE_URL baking a broken
 * host into the manifest — which would route GitHub's conversion callback
 * to a URL the admin can't reach, locking the App's secrets behind an
 * unreachable redirect.
 */
async function publicBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1')) {
    return `${proto}://${host}`.replace(/\/$/, '');
  }
  return env.siteUrl.replace(/\/$/, '');
}

function buildManifest(base: string) {
  return {
    name: 'sh1pt Actions Fleet',
    url: base,
    hook_attributes: { url: `${base}/api/webhooks/github`, active: false },
    redirect_url: `${base}/api/github/setup-callback`,
    callback_urls: [`${base}/api/github/installations/callback`],
    setup_url: `${base}/api/github/installations/callback`,
    setup_on_update: true,
    public: true,
    default_permissions: {
      contents: 'write',
      workflows: 'write',
      pull_requests: 'write',
      metadata: 'read',
      actions: 'read',
    } as ManifestPermissions,
    // `installation` and `installation_repositories` events are sent to
    // every App automatically; they are NOT gated by a permission and so
    // can't be listed here. The webhook (when wired) will receive them
    // anyway.
    default_events: [],
    description:
      'sh1pt Actions Fleet — installs and updates GitHub Actions workflow packs across your repos via reviewable pull requests.',
  };
}

export default async function AdminGithubSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const { error } = await searchParams;
  const base = await publicBaseUrl();
  const manifest = buildManifest(base);

  // Org-owned App. Personal-account form lives at /settings/apps/new.
  const ORG = 'profullstack';
  const action = `https://github.com/organizations/${ORG}/settings/apps/new?state=${encodeURIComponent('sh1pt-actions-fleet-setup')}`;

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href="/admin" className="muted">
          ← Admin
        </Link>
      </p>
      <h1 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', marginTop: 8 }}>
        Register sh1pt as a GitHub App
      </h1>
      <p className="muted" style={{ marginTop: 8 }}>
        One-time platform setup. The App will be owned by the <code>{ORG}</code> org. Click{' '}
        <strong>Create GitHub App</strong> below; GitHub redirects back here with the App&apos;s
        secrets — copy them into Railway and the integration is live for every sh1pt user.
      </p>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid rgba(248,113,113,0.4)',
            background: 'rgba(248,113,113,0.08)',
            borderRadius: 8,
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0 }}>What gets created</h2>
        <ul style={{ marginTop: 12, fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li>
            App name <code>sh1pt Actions Fleet</code>, owned by <code>{ORG}</code>, public on
            GitHub (installable by any account).
          </li>
          <li>
            Permissions: <code>Contents: write</code>, <code>Pull requests: write</code>,{' '}
            <code>Workflows: write</code>, <code>Metadata: read</code>,{' '}
            <code>Actions: read</code>. Enough to push a branch, open a PR, write workflow files,
            and read workflow runs.
          </li>
          <li>
            No default events subscribed (installation/repo events fire on every App regardless).
            Webhook URL set but inactive until you flip it on later.
          </li>
          <li>
            Callback URLs derived from this request&apos;s host:
            <ul>
              <li>
                Install callback: <code>{base}/api/github/installations/callback</code>
              </li>
              <li>
                Setup callback: <code>{base}/api/github/setup-callback</code>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <form action={action} method="POST" style={{ marginTop: 16 }}>
        <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
        <button type="submit" className="btn" style={{ fontSize: '1rem' }}>
          Create GitHub App for {ORG} →
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16, fontSize: '0.8rem' }}>
        Note: GitHub does not expose App creation via REST or the gh CLI. The manifest flow is the
        supported one-click alternative.
      </p>
    </main>
  );
}
