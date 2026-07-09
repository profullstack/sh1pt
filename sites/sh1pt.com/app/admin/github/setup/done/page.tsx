// Admin-only: receives the App Manifest conversion result from
// /api/github/setup-callback. Secrets land in the URL fragment (not the
// query) so they aren't sent to the server / logged. A tiny client
// component reads them and formats them for the admin to paste into
// Railway.

import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-guard';
import SetupDoneClient from './SetupDoneClient';

export const metadata = {
  title: 'Admin · GitHub App created — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminGithubSetupDonePage() {
  await requireAdminPage();
  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href="/admin" className="muted">
          ← Admin
        </Link>
      </p>
      <h1 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', marginTop: 8 }}>App created ✓</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Copy each value into Railway → <strong>Variables</strong> on the <code>sh1pt.com</code>{' '}
        service, then redeploy. After redeploy, users can install the App from{' '}
        <Link href="/dashboard/connect/github">/dashboard/connect/github</Link>.
      </p>
      <SetupDoneClient />
    </main>
  );
}
