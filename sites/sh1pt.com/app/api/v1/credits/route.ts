import { NextResponse } from 'next/server';
import { requestUser } from '@/lib/request-user';
import { planFor } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/credits: the signed-in user's plan (Pro via prepay or
// pro_until). Browser session or `Authorization: Bearer <access_token>`.
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json(await planFor(user.id));
}
