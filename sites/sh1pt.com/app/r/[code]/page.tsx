import { redirect } from 'next/navigation';

// /r/[code] — the link referrers share. We stamp the code into a cookie
// and send them to the waitlist; when they convert the server action
// credits the inviter.
export default async function ReferralLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/waitlist?ref=${encodeURIComponent(code)}`);
}
