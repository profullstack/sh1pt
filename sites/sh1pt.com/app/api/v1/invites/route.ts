import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/request-user';
import { InviteError, createInvite, inviteOverview, inviteUrl, originFromHeaders, settleInvitesSentBy } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/invites: quota + invites. POST { note? }: create one (the
// plaintext code and link are returned once). Session or Bearer token.
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  await settleInvitesSentBy(user.id);
  return NextResponse.json(await inviteOverview(user.id));
}

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  let note = '';
  try {
    const body = (await req.json()) as { note?: unknown };
    note = typeof body.note === 'string' ? body.note : '';
  } catch {
    // no body
  }
  try {
    const inv = await createInvite(user.id, note);
    return NextResponse.json({
      id: inv.id,
      code: inv.code,
      url: inviteUrl(originFromHeaders(req.headers), inv.code),
      expiresAt: inv.expiresAt,
    });
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error('[invites] create', err);
    return NextResponse.json({ error: 'Could not create an invite right now.' }, { status: 500 });
  }
}
