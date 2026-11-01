import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { db } from '@/lib/supabase';
import { env } from '@/lib/env';
import { toE164 } from '@/lib/phone';
import { verifyAndWelcome } from '@/lib/verify';
import type { QuoteRow } from '@/lib/sync';
import { BUSINESS, QUOTE_CODE_IN_TEXT } from '@/lib/options';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Meta webhook verification handshake (only used when WHATSAPP_PROVIDER=meta).
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && env.waVerifyToken() && u.searchParams.get('hub.verify_token') === env.waVerifyToken()) {
    return new NextResponse(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

type Inbound = { from: string; text: string };

function metaMessages(body: any): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const m of change?.value?.messages || []) {
        const text = m?.text?.body || m?.button?.text || m?.interactive?.button_reply?.title || '';
        if (m?.from) out.push({ from: '+' + String(m.from).replace(/\D/g, ''), text });
      }
    }
  }
  return out;
}

// GHL workflow "Webhook" / "Custom Webhook" action payload (trigger: Customer Replied, channel WhatsApp).
// GHL sends custom data either at the top level or under customData, and the message either as
// a string or as { body }. Accept all of these shapes.
function ghlMessage(body: any): Inbound[] {
  const cd = body?.customData || {};
  const pick = (...vals: unknown[]) => vals.find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  const text = pick(cd.message, body?.message?.body, body?.message, body?.body, body?.message_body) || '';
  const from = pick(cd.phone, body?.phone, body?.contact?.phone, body?.phone_raw) || '';
  return from ? [{ from, text }] : [];
}

// Last inbound result, saved in app_state so it can be checked from Supabase without server logs.
async function logInbound(entry: Record<string, unknown>) {
  try {
    await db().from('app_state').upsert({ key: 'last_whatsapp_inbound', value: { at: new Date().toISOString(), ...entry } });
  } catch {
    /* logging must never break the webhook */
  }
}

function parseBody(raw: string, contentType: string): any {
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function validMetaSignature(raw: string, header: string | null): boolean {
  const secret = env.waAppSecret();
  if (!secret || !header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const body = parseBody(raw, req.headers.get('content-type') || '');

  let messages: Inbound[];
  const metaSig = req.headers.get('x-hub-signature-256');
  if (metaSig) {
    if (!validMetaSignature(raw, metaSig)) return NextResponse.json({ ok: false }, { status: 401 });
    messages = metaMessages(body);
  } else {
    const secret = env.ghlWebhookSecret();
    const given = new URL(req.url).searchParams.get('secret') || req.headers.get('x-webhook-secret') || '';
    if (!secret || given !== secret) {
      await logInbound({ result: 'rejected: wrong or missing secret in the webhook URL' });
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    messages = ghlMessage(body);
    if (!messages.length) await logInbound({ result: 'no phone number in the webhook data', keys: Object.keys(body || {}) });
  }

  // Answer the webhook right away; verification and replies run after the response.
  after(async () => {
    const contactHint = body?.customData?.contact_id || body?.contact_id || body?.contactId || null;
    for (const m of messages) {
      await handle(m, contactHint).catch(async (e) => {
        console.error('whatsapp inbound failed', e);
        await logInbound({ result: 'error', error: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      });
    }
  });
  return NextResponse.json({ ok: true });
}

async function findRequest(m: Inbound): Promise<QuoteRow | null> {
  const code = QUOTE_CODE_IN_TEXT.exec(m.text);
  if (code) {
    const { data } = await db().from('quote_requests').select('*').eq('verify_code', `${BUSINESS.codePrefix}-${code[1]}`).maybeSingle();
    if (data) return data as QuoteRow;
  }
  // No code in the message (for example a tap on "Yes, send it here"): match the newest request from
  // this number in the last 7 days that has not had its WhatsApp reply yet.
  const phone = toE164(m.from);
  if (!phone) return null;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await db()
    .from('quote_requests')
    .select('*')
    .eq('phone_e164', phone)
    .eq('welcome_sent', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as QuoteRow) || null;
}

async function handle(m: Inbound, ghlContactFromWebhook: string | null) {
  const row = await findRequest(m);
  if (!row) {
    await logInbound({ result: 'no matching quote for this number or code', text: m.text.slice(0, 80) });
    return;
  }
  if (row.welcome_sent) {
    await logInbound({ result: 'already replied earlier', code: row.verify_code });
    return;
  }
  await verifyAndWelcome(row, toE164(m.from) || m.from, ghlContactFromWebhook);
  await logInbound({ result: 'replied with PDF', code: row.verify_code });
}
