import { randomInt } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { submissionSchema } from '@/lib/schema';
import { clientIp, db, rateLimit } from '@/lib/supabase';
import { verifyTurnstile } from '@/lib/turnstile';
import { toE164 } from '@/lib/phone';
import { scoreLead } from '@/lib/scoring';
import { env } from '@/lib/env';
import { sendCapi } from '@/lib/capi';
import { processRequest } from '@/lib/service';
import { alertAdmins } from '@/lib/email';
import { logSubmit } from '@/lib/funnel/server';
import { isQualified } from '@/lib/scoring';
import { BUSINESS } from '@/lib/options';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rfq:${ip}`, 6, 600))) {
    return NextResponse.json({ error: `Too many requests from this network. Wait a few minutes${BUSINESS.phoneDisplay ? `, or call ${BUSINESS.phoneDisplay}` : ''}.` }, { status: 429 });
  }

  const parsed = submissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || 'Check the form and try again.', field: issue?.path.join('.') }, { status: 400 });
  }
  const s = parsed.data;

  if (!(await verifyTurnstile(s.turnstileToken, ip))) {
    return NextResponse.json({ error: 'Spam check did not pass. Refresh the page and try again.' }, { status: 400 });
  }

  const phone = toE164(s.phone);
  if (!phone) return NextResponse.json({ error: 'Check your WhatsApp number: choose your country code and enter the number without the leading 0.', field: 'phone' }, { status: 400 });

  // Confirm every uploaded file really exists in private storage and is within the size limit.
  const maxBytes = env.maxMb() * 1024 * 1024;
  for (const f of s.files) {
    const folder = f.path.slice(0, f.path.lastIndexOf('/'));
    const fileName = f.path.slice(f.path.lastIndexOf('/') + 1);
    const { data } = await db().storage.from(env.artworkBucket()).list(folder, { search: fileName });
    const found = data?.find((o) => o.name === fileName);
    const size = Number((found?.metadata as { size?: number } | undefined)?.size ?? 0);
    if (!found) return NextResponse.json({ error: `${f.name} did not finish uploading. Tap Retry on that file.`, field: 'files' }, { status: 400 });
    if (size > maxBytes) return NextResponse.json({ error: `${f.name} is over ${env.maxMb()} MB.`, field: 'files' }, { status: 400 });
    f.size = size || f.size;
  }

  const hasArtwork = s.files.length > 0;
  const { score, grade, tags } = scoreLead({
    quantity: s.quantity,
    patchType: s.patchType,
    hasArtwork,
    deadline: s.deadline,
    deadlineDate: s.deadlineDate || undefined,
    business: s.business,
    notes: s.notes,
  });

  const row = {
    event_id: s.eventId,
    first_name: s.firstName,
    last_name: s.lastName,
    business: s.business || null,
    email: s.email.toLowerCase(),
    phone_e164: phone,
    contact_method: s.contactMethod,
    patch_type: s.patchType,
    quantity: s.quantity,
    width: s.sizeUnsure ? null : s.width,
    height: s.sizeUnsure ? null : s.height,
    size_unsure: s.sizeUnsure,
    backing: s.backing,
    deadline: s.deadline,
    deadline_date: s.deadline === 'Specific deadline' ? s.deadlineDate : null,
    notes: s.notes || null,
    files: s.files,
    no_artwork: !hasArtwork,
    lead_score: score,
    lead_grade: grade,
    tags,
    tracking: s.tracking,
    client_ip: ip,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 500),
    status: 'pending',
  };

  // Save FIRST. Retry with a new code on the rare code collision; a repeated event_id means
  // the browser resent the same submission, so return the existing record.
  let saved: { id: string; verify_code: string } | null = null;
  for (let i = 0; i < 4 && !saved; i++) {
    const verify_code = `${BUSINESS.codePrefix}-${randomInt(100000, 1000000)}`;
    const { data, error } = await db().from('quote_requests').insert({ ...row, verify_code }).select('id, verify_code').single();
    if (data) saved = data;
    else if (error?.code === '23505' && error.message.includes('event_id')) {
      const { data: existing } = await db().from('quote_requests').select('id, verify_code').eq('event_id', s.eventId).single();
      saved = existing;
    } else if (error?.code !== '23505') {
      console.error('quote save failed', error);
      await alertAdmins('Quote could not be saved', `Database insert failed: ${error?.message}\n\n${JSON.stringify({ ...row, client_ip: undefined }, null, 2)}`).catch(() => undefined);
      return NextResponse.json({ error: `We could not save your request. Please try again in a minute${BUSINESS.phoneDisplay ? ` or call ${BUSINESS.phoneDisplay}` : ''}.` }, { status: 500 });
    }
  }
  if (!saved) return NextResponse.json({ error: 'Please try again.' }, { status: 500 });

  const id = saved.id;
  after(async () => {
    await logSubmit(s.tracking, { rfqId: id, qualified: isQualified(grade), grade, score, patchType: s.patchType, quantity: s.quantity }).catch((e) =>
      console.error('funnel submit log failed', e),
    );
    await sendCapi({
      eventName: 'Lead',
      eventId: s.eventId,
      sourceUrl: s.tracking.landing_page,
      email: row.email,
      phone,
      firstName: s.firstName,
      lastName: s.lastName,
      externalId: id,
      ip,
      userAgent: row.user_agent,
      fbp: s.tracking.fbp,
      fbc: s.tracking.fbc,
      customData: { patch_type: s.patchType, quantity: s.quantity, lead_grade: grade },
    });
    await processRequest(id).catch((e) => console.error('processing failed, cron will retry', e));
  });

  return NextResponse.json({ id, code: saved.verify_code, grade, hasArtwork });
}
