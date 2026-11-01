import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, clientIp, rateLimit } from '@/lib/supabase';
import { env } from '@/lib/env';
import { verifyAndWelcome } from '@/lib/verify';
import type { QuoteRow } from '@/lib/sync';
import { QUOTE_CODE_RE } from '@/lib/options';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Fallback for visitors who cannot open WhatsApp from this device:
// Twilio Verify sends a 6 digit code to their WhatsApp and they type it on the thank you page.
const body = z.object({
  id: z.string().uuid(),
  code: z.string().regex(QUOTE_CODE_RE),
  action: z.enum(['send', 'check']),
  otp: z.string().regex(/^\d{4,8}$/).optional(),
});

export async function POST(req: Request) {
  if (!env.twilioSid() || !env.twilioToken() || !env.twilioVerifySid()) {
    return NextResponse.json({ error: 'Code by WhatsApp is not available. Tap Verify on WhatsApp instead.' }, { status: 501 });
  }
  const ip = clientIp(req);
  if (!(await rateLimit(`otp:${ip}`, 8, 900))) {
    return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { id, code, action, otp } = parsed.data;
  const { data } = await db().from('quote_requests').select('*').eq('id', id).eq('verify_code', code).maybeSingle();
  const row = data as QuoteRow | null;
  if (!row) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
  if (row.whatsapp_verified_at) return NextResponse.json({ verified: true });

  const auth = 'Basic ' + Buffer.from(`${env.twilioSid()}:${env.twilioToken()}`).toString('base64');
  const base = `https://verify.twilio.com/v2/Services/${env.twilioVerifySid()}`;
  if (action === 'send') {
    const res = await fetch(`${base}/Verifications`, {
      method: 'POST',
      headers: { Authorization: auth },
      body: new URLSearchParams({ To: row.phone_e164, Channel: 'whatsapp' }),
    });
    if (!res.ok) {
      console.error('twilio send failed', res.status, await res.text());
      return NextResponse.json({ error: 'We could not send a code to that WhatsApp number. Check the number or tap Verify on WhatsApp.' }, { status: 400 });
    }
    return NextResponse.json({ sent: true });
  }
  if (!otp) return NextResponse.json({ error: 'Enter the code from WhatsApp.' }, { status: 400 });
  const res = await fetch(`${base}/VerificationCheck`, {
    method: 'POST',
    headers: { Authorization: auth },
    body: new URLSearchParams({ To: row.phone_e164, Code: otp }),
  });
  const result = (await res.json().catch(() => ({}))) as { status?: string };
  if (result.status !== 'approved') return NextResponse.json({ error: 'That code is not right. Check WhatsApp and try again.' }, { status: 400 });
  await verifyAndWelcome(row, row.phone_e164);
  return NextResponse.json({ verified: true });
}
