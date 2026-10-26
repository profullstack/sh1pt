import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { getCreditDeps } from '@/lib/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/v1/admin/credit-codes/<id>: revoke a code (idempotent).
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;
  const { id } = await context.params;
  try {
    await getCreditDeps().credits.revoke(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
