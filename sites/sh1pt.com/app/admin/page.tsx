import { requireAdminPage } from '@/lib/admin-guard';
import { githubAppStatus } from '@/lib/github-app';
import AdminContent from './AdminContent';

export const metadata = {
  title: 'Admin — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // Server-side gate: redirects to /login if signed-out, throws 403 if
  // signed in but not is_admin. The client-side admin UI doesn't need
  // to re-check — the gate above guarantees it only renders for admins.
  await requireAdminPage();
  // Read env-based GitHub App status here (server) and pass to the
  // client component — lib/github-app is server-only.
  const ghStatus = githubAppStatus();
  return <AdminContent ghStatus={ghStatus} />;
}
