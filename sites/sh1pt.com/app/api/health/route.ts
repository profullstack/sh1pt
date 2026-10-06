// Public health check for status.profullstack.com: one HEAD select against
// profiles, capped at 3s. Never returns error details.

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const { error } = await getSupabaseServiceClient()
      .from('profiles')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
    return NextResponse.json({ status: 'ok', db: 'ok' }, { headers: HEADERS });
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'down' },
      { status: 503, headers: HEADERS },
    );
  }
}
