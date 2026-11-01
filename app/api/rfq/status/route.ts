import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { QUOTE_CODE_RE } from '@/lib/options';

export const runtime = 'nodejs';

// Lets the thank you page show "WhatsApp verified" once the customer has messaged us.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') || '';
  const code = u.searchParams.get('code') || '';
  if (!/^[0-9a-f-]{36}$/.test(id) || !QUOTE_CODE_RE.test(code)) return NextResponse.json({ verified: false }, { status: 400 });
  const { data } = await db().from('quote_requests').select('whatsapp_verified_at').eq('id', id).eq('verify_code', code).maybeSingle();
  return NextResponse.json({ verified: !!data?.whatsapp_verified_at }, { headers: { 'Cache-Control': 'no-store' } });
}
