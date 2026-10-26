import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/request-user';
import { redeemCreditCode } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/v1/credits/redeem { code }: redeem a credit code for days of
// sh1pt Pro. Browser session or `Authorization: Bearer <access_token>`.
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  let code = '';
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === 'string' ? body.code.trim() : '';
  } catch {
    // fall through
  }
  if (!code || code.length > 64) {
    return NextResponse.json({ ok: false, reason: 'invalid', error: 'Enter a code.' }, { status: 400 });
  }
  try {
    const r = await redeemCreditCode(user.id, code);
    if (!r.ok) {
      return NextResponse.json({ ok: false, reason: r.reason, error: r.message }, { status: 400 });
    }
    return NextResponse.json(r);
  } catch (err) {
    console.error('[credits/redeem]', err);
    return NextResponse.json({ ok: false, error: 'Could not redeem the code right now.' }, { status: 500 });
  }
}
