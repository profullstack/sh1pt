import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/request-user';
import { InviteError, revokeInvite } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/v1/invites/<id>: withdraw an unused invite (refunds the slot).
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id } = await context.params;
  try {
    await revokeInvite(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error('[invites] revoke', err);
    return NextResponse.json({ error: 'Could not withdraw the invite.' }, { status: 500 });
  }
}
