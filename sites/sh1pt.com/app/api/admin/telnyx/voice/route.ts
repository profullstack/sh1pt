import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-guard';
import { telnyxVoiceStatus } from '@/lib/telnyx-voice';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireAdminApi();
  if (guard instanceof NextResponse) return guard;

  return NextResponse.json({
    webhookUrl: `${env.siteUrl.replace(/\/+$/, '')}/api/webhooks/telnyx/voice`,
    status: telnyxVoiceStatus(),
  });
}
