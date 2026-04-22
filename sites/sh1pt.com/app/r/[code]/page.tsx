import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// /r/[code] — the link referrers share. We stamp the code into a
// 90-day cookie so it sticks across tabs, sessions, and the gap
// between "I'll sign up later" and actually signing up. The waitlist
// action reads cookie-or-query to credit the inviter.

const COOKIE = 'sh1pt_ref';
const NINETY_DAYS = 60 * 60 * 24 * 90;

export default async function ReferralLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const jar = await cookies();
  jar.set(COOKIE, code, {
    maxAge: NINETY_DAYS,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });

  redirect(`/waitlist?ref=${encodeURIComponent(code)}`);
}
