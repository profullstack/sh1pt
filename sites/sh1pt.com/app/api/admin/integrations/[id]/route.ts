import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('blog_integrations')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete integration' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
