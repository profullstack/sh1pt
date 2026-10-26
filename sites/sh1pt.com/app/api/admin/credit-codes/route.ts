import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { getCreditDeps, mintCreditCode } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: every credit code (never the plaintext). POST { days, label?,
// maxRedemptions?, expiresInDays? }: mint one; the code is shown once.
export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ codes: await getCreditDeps().credits.list() });
}

export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty
  }
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  try {
    const minted = await mintCreditCode({
      days: num(body.days) ?? NaN,
      label: typeof body.label === 'string' ? body.label : undefined,
      maxRedemptions: num(body.maxRedemptions),
      expiresInDays: num(body.expiresInDays) ?? null,
      createdBy: guard.email || guard.id,
    });
    return NextResponse.json(minted);
  } catch (err) {
    if (err instanceof TypeError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[admin/credit-codes] mint', err);
    return NextResponse.json({ error: 'Mint failed' }, { status: 500 });
  }
}
