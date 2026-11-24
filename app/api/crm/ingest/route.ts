import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/supabase';
import { env } from '@/lib/env';
import { ARTWORK_EXTENSIONS, ARTWORK_MIME } from '@/lib/options';
import { sendNewLeadPush } from '@/lib/push';

// Leads from other client funnels (each its own Vercel project and database) arrive here, so every client's
// leads live in this one Madvert Labs Patches CRM under their own account. The sending funnel has already
// emailed the customer and the client, so nothing here emails or messages anyone: the lead is saved with
// every automation marked done, its artwork and quote PDF are copied into this CRM's storage, and the
// client's team gets the new lead push. Safe to resend: the funnel's event id makes it idempotent.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

const fileUrl = z
  .string()
  .url()
  .refine((u) => {
    // Only signed storage links from Supabase: never fetch arbitrary addresses on a sender's say so.
    try {
      const { protocol, hostname } = new URL(u);
      return protocol === 'https:' && hostname.endsWith('.supabase.co');
    } catch {
      return false;
    }
  }, 'files must be Supabase storage links');

const payload = z.object({
  accountSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  lead: z.object({
    eventId: z.string().uuid(),
    verifyCode: z.string().regex(/^[A-Z]{2,5}-\d{6}$/),
    createdAt: z.string().datetime({ offset: true }),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    business: z.string().max(120).nullable(),
    email: z.string().email().max(200),
    phone: z.string().min(8).max(25),
    contactMethod: z.string().max(20),
    patchType: z.string().max(60),
    quantity: z.string().max(40),
    width: z.string().max(10).nullable(),
    height: z.string().max(10).nullable(),
    sizeUnsure: z.boolean(),
    backing: z.string().max(40),
    deadline: z.string().max(40),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    notes: z.string().max(3000).nullable(),
    noArtwork: z.boolean(),
    leadScore: z.number().int().nullable(),
    leadGrade: z.string().max(20).nullable(),
    tags: z.array(z.string().max(60)).max(30),
    tracking: z.record(z.unknown()),
    whatsappVerifiedAt: z.string().datetime({ offset: true }).nullable(),
    source: z.string().max(200),
  }),
  files: z.array(z.object({ name: z.string().min(1).max(200), ext: z.string().max(5), url: fileUrl })).max(10),
  pdf: z.object({ name: z.string().max(200), url: fileUrl }).nullable(),
});

function authorized(req: Request): boolean {
  const secret = env.crmIngestSecret();
  const sent = req.headers.get('x-crm-ingest-secret') || '';
  if (!secret || !sent) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(sent);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function copy(url: string, path: string, contentType: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error('file over 25 MB');
  const { error } = await db().storage.from(env.artworkBucket()).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error('storage upload failed: ' + error.message);
  return bytes.byteLength;
}

export async function POST(req: Request) {
  if (!env.crmIngestSecret()) return NextResponse.json({ error: 'CRM_INGEST_SECRET is not set on the CRM' }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join('.')}: ${issue?.message}` }, { status: 400 });
  }
  const { accountSlug, lead: l, files, pdf } = parsed.data;

  const { data: account } = await db().from('crm_accounts').select('id, name').eq('slug', accountSlug).maybeSingle();
  if (!account) return NextResponse.json({ error: `no CRM account with slug ${accountSlug}` }, { status: 404 });

  // Already received (the funnel retried): answer with the same lead.
  const { data: existing } = await db().from('quote_requests').select('id').eq('event_id', l.eventId).maybeSingle();
  if (existing) return NextResponse.json({ id: (existing as { id: string }).id, duplicate: true });

  const id = randomUUID();
  const folder = randomUUID();
  const saved: { path: string; name: string; size: number; ext: string }[] = [];
  try {
    for (const f of files) {
      const ext = f.ext.toLowerCase();
      if (!(ARTWORK_EXTENSIONS as readonly string[]).includes(ext)) continue;
      const path = `rfq/${folder}/${randomUUID()}.${ext}`;
      const size = await copy(f.url, path, ARTWORK_MIME[ext] || 'application/octet-stream');
      saved.push({ path, name: f.name, size, ext });
    }
  } catch (e) {
    return NextResponse.json({ error: `artwork copy failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
  let pdfPath: string | null = null;
  if (pdf) {
    const path = `pdf/${id}/${pdf.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120) || 'quote.pdf'}`;
    try {
      await copy(pdf.url, path, 'application/pdf');
      pdfPath = path;
    } catch (e) {
      console.error('ingest: quote PDF copy failed, saving the lead without it', e);
    }
  }

  const now = new Date().toISOString();
  const { error } = await db().from('quote_requests').insert({
    id,
    created_at: l.createdAt,
    account_id: (account as { id: string }).id,
    source: 'funnel',
    // The sending funnel already ran every automation; mark them done so this CRM never repeats them.
    status: 'done',
    email_sent: true,
    owner_alert_sent: true,
    welcome_sent: true,
    nudge_sent_at: now,
    qualified_event_sent: true,
    verify_code: l.verifyCode,
    whatsapp_verified_at: l.whatsappVerifiedAt,
    pdf_path: pdfPath,
    event_id: l.eventId,
    first_name: l.firstName,
    last_name: l.lastName,
    business: l.business,
    email: l.email.toLowerCase(),
    phone_e164: l.phone,
    contact_method: l.contactMethod,
    patch_type: l.patchType,
    quantity: l.quantity,
    width: l.width,
    height: l.height,
    size_unsure: l.sizeUnsure,
    backing: l.backing,
    deadline: l.deadline,
    deadline_date: l.deadlineDate,
    notes: l.notes,
    files: saved,
    no_artwork: l.noArtwork,
    lead_score: l.leadScore,
    lead_grade: l.leadGrade,
    tags: l.tags,
    tracking: { ...l.tracking, funnel: l.source },
  });
  if (error) {
    // A resend racing the first request: the event id is unique, so return the lead that won.
    if (error.code === '23505' && error.message.includes('event_id')) {
      const { data: again } = await db().from('quote_requests').select('id').eq('event_id', l.eventId).maybeSingle();
      if (again) return NextResponse.json({ id: (again as { id: string }).id, duplicate: true });
    }
    return NextResponse.json({ error: 'save failed: ' + error.message }, { status: 500 });
  }

  after(async () => {
    await sendNewLeadPush(id).catch((e) => console.error('ingest push failed', e));
  });
  return NextResponse.json({ id });
}
