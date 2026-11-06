import 'server-only';
import { db } from './supabase';
import { env } from './env';
import { Ghl } from './ghl';
import { fileLink } from './token';
import { alertAdmins, sendEmail } from './email';
import { sendWhatsAppTemplate } from './whatsapp';
import { buildQuotePdf } from './pdf';
import { ownerWhatsAppLink, syncToGhl, summaryRows, type QuoteRow, type SyncDeps } from './sync';

export { ownerWhatsAppLink };
import { sendCapi } from './capi';
import { isQualified } from './scoring';
import { BUSINESS, contactLine, waVerifyText } from './options';

const SEVEN_DAYS = 7 * 24 * 3600;

export async function loadRow(id: string): Promise<QuoteRow | null> {
  const { data } = await db().from('quote_requests').select('*').eq('id', id).maybeSingle();
  return (data as QuoteRow) || null;
}

export async function updateRow(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('quote_requests').update(patch).eq('id', id);
  if (error) throw new Error('Supabase update failed: ' + error.message);
}

export function syncDeps(): SyncDeps {
  return {
    ghl: new Ghl(env.ghlToken(), env.ghlLocationId(), env.ghlBase()),
    store: { update: updateRow },
    pipelineName: env.ghlPipelineName(),
    stageName: env.ghlStageName(),
    userIds: env.ghlUserIds(),
    nextRoundRobin: async (size) => {
      const { data, error } = await db().rpc('next_round_robin', { p_size: size });
      if (error) throw new Error('round robin failed: ' + error.message);
      return Number(data) || 0;
    },
    links: { artwork: fileLink, pdf: fileLink },
    alert: alertAdmins,
  };
}

async function download(path: string): Promise<Uint8Array | null> {
  const { data } = await db().storage.from(env.artworkBucket()).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

export async function signedUrl(path: string, seconds = SEVEN_DAYS): Promise<string | null> {
  const { data } = await db().storage.from(env.artworkBucket()).createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}

// Builds the customer PDF (details plus artwork) and stores it privately.
export async function ensurePdf(row: QuoteRow): Promise<{ path: string; bytes: Uint8Array }> {
  if (row.pdf_path) {
    const bytes = await download(row.pdf_path);
    if (bytes) return { path: row.pdf_path, bytes };
  }
  const artwork = await Promise.all(
    row.files.map(async (f) => ({
      name: f.name,
      ext: f.ext,
      // Only images and PDFs can be placed in the PDF; skip big downloads for other formats.
      bytes: ['png', 'jpg', 'jpeg', 'pdf'].includes(f.ext) ? await download(f.path) : null,
    })),
  );
  const logo = await fetch(`${env.siteUrl()}/assets/logo-240.png`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? new Uint8Array(b) : null))
    .catch(() => null);
  const bytes = await buildQuotePdf({
    quoteNumber: row.verify_code,
    firstName: row.first_name,
    lastName: row.last_name,
    business: row.business || undefined,
    email: row.email,
    phone: row.phone_e164,
    rows: summaryRows(row),
    notes: row.notes || undefined,
    artwork,
    logo,
    submittedAt: new Date(row.created_at),
  });
  const path = `pdf/${row.id}/Custom-Patch-Lab-Quote-${row.verify_code}.pdf`;
  const { error } = await db().storage.from(env.artworkBucket()).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error('PDF upload failed: ' + error.message);
  await updateRow(row.id, { pdf_path: path });
  row.pdf_path = path;
  return { path, bytes };
}

export async function emailCustomer(row: QuoteRow): Promise<void> {
  if (row.email_sent) return;
  const viaGhl = env.customerEmailVia() === 'ghl';
  if (viaGhl && !row.ghl_contact_id) return; // sent after the GHL contact exists
  const { bytes, path } = await ensurePdf(row);
  const wa = env.whatsappBusinessNumber();
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waVerifyText(row.verify_code))}` : '';
  const rows = summaryRows(row)
    .map((r) => `<tr><td style="padding:6px 0;color:#55595F">${r.k}</td><td style="padding:6px 0;text-align:right;font-weight:700">${r.v}</td></tr>`)
    .join('');
  const subject = `Your ${BUSINESS.name} quote request ${row.verify_code}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#121316;max-width:560px">
      <h2 style="margin:0 0 8px">Thanks ${escapeHtml(row.first_name)}, your quote request is in!</h2>
      <p style="color:#55595F">Our patch team will send your quote and free mockup within 24 hours. Your full request and artwork are attached as a PDF.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
      ${waLink ? `<p style="margin:24px 0"><a href="${waLink}" style="background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;display:inline-block">Chat with us on WhatsApp</a></p>` : ''}
      <p style="color:#55595F;font-size:13px">${escapeHtml(contactLine('. '))}.</p>
    </div>`;
  let ok = false;
  if (viaGhl) {
    const url = await signedUrl(path);
    const ghl = new Ghl(env.ghlToken(), env.ghlLocationId(), env.ghlBase());
    await ghl.sendEmail(row.ghl_contact_id!, subject, html, url ? [url] : [], env.ghlEmailFrom());
    ok = true;
  } else {
    ok = await sendEmail({
      to: [row.email],
      subject,
      html,
      attachments: [{ filename: `Custom-Patch-Lab-Quote-${row.verify_code}.pdf`, content: bytes }],
    });
  }
  if (ok) await updateRow(row.id, { email_sent: true });
}

export async function sendQualifiedEvent(row: QuoteRow): Promise<void> {
  if (row.qualified_event_sent || !isQualified(row.lead_grade)) return;
  const t = row.tracking || {};
  const sent = await sendCapi({
    eventName: 'QualifiedRFQ',
    eventId: `qualified-${row.id}`,
    sourceUrl: t.landing_page,
    email: row.email,
    phone: row.phone_e164,
    firstName: row.first_name,
    lastName: row.last_name,
    externalId: row.id,
    fbp: t.fbp,
    fbc: t.fbc,
    customData: { lead_score: row.lead_score, lead_grade: row.lead_grade, patch_type: row.patch_type, quantity: row.quantity },
  });
  if (sent) await updateRow(row.id, { qualified_event_sent: true });
}

// Instant "new lead" email to the owner with one tap Call, WhatsApp and artwork links.
export async function alertOwner(row: QuoteRow): Promise<void> {
  if (row.owner_alert_sent) return;
  const to = env.alertEmails();
  if (!to.length) return;
  const art = row.files.map((f) => `<a href="${fileLink(f.path)}">${escapeHtml(f.name)}</a>`).join('<br>') || 'No artwork, needs design help';
  const pdf = row.pdf_path ? `<a href="${fileLink(row.pdf_path)}">Quote PDF</a>` : '';
  const t = row.tracking || {};
  const rows = [
    ...summaryRows(row),
    { k: 'Lead score', v: `${row.lead_score} (${row.lead_grade})` },
    { k: 'Tags', v: row.tags.join(', ') },
    { k: 'Business', v: row.business || 'n/a' },
    { k: 'Email', v: row.email },
    { k: 'WhatsApp', v: row.phone_e164 },
    { k: 'Source', v: [t.utm_source, t.utm_campaign, t.utm_content].filter(Boolean).join(' / ') || 'Direct' },
  ]
    .map((r) => `<tr><td style="padding:6px 0;color:#55595F">${escapeHtml(r.k)}</td><td style="padding:6px 0;text-align:right;font-weight:700">${escapeHtml(String(r.v))}</td></tr>`)
    .join('');
  const btn = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;background:${bg};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px">${label}</a>`;
  const ok = await sendEmail({
    to,
    subject: `New quote ${row.verify_code}: ${row.first_name} ${row.last_name}, ${row.quantity} ${row.patch_type} (${row.lead_grade})`,
    html: `<div style="font-family:Arial,sans-serif;color:#121316;max-width:600px">
      <h2 style="margin:0 0 4px">New quote request ${row.verify_code}</h2>
      <p style="margin:0 0 16px;color:#55595F">Reply fast: leads contacted within 5 minutes are far more likely to buy.</p>
      <p>${btn(ownerWhatsAppLink(row), 'WhatsApp customer', '#25D366')}${btn(`tel:${row.phone_e164}`, 'Call', '#121316')}${btn(`mailto:${row.email}?subject=${encodeURIComponent(`Your ${BUSINESS.name} quote ` + row.verify_code)}`, 'Email', '#1E5BC6')}${btn(`${env.crmUrl()}/lead/${row.id}`, 'Open in CRM', '#D9262C')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
      <p><strong>Notes:</strong> ${escapeHtml(row.notes || 'none')}</p>
      <p><strong>Artwork:</strong><br>${art}</p>
      <p>${pdf}</p>
    </div>`,
  });
  if (ok) await updateRow(row.id, { owner_alert_sent: true });
}

// Email nudge (and WhatsApp template if one is approved) for customers who have not verified yet.
export async function nudgeUnverified(row: QuoteRow): Promise<void> {
  if (row.whatsapp_verified_at || row.nudge_sent_at) return;
  await updateRow(row.id, { nudge_sent_at: new Date().toISOString() });
  const wa = env.whatsappBusinessNumber();
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waVerifyText(row.verify_code))}` : '';
  if (waLink) {
    await sendEmail({
      to: [row.email],
      subject: `${row.first_name}, where should we send your free mockup?`,
      html: `<div style="font-family:Arial,sans-serif;color:#121316;max-width:560px">
        <h2 style="margin:0 0 8px">Your patch mockup is being prepared</h2>
        <p style="color:#55595F">Hi ${escapeHtml(row.first_name)}, we are working on your ${escapeHtml(row.quantity)} ${escapeHtml(row.patch_type)} patches (quote ${row.verify_code}). The fastest way to get your price and mockup is WhatsApp. Tap below and press Send.</p>
        <p style="margin:24px 0"><a href="${waLink}" style="background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;display:inline-block">Get my mockup on WhatsApp</a></p>
        <p style="color:#55595F;font-size:13px">Prefer email? Just reply to this message. ${escapeHtml(contactLine('. '))}.</p>
      </div>`,
    });
  }
  if (env.waNudgeTemplate()) {
    await sendWhatsAppTemplate(row.phone_e164, env.waNudgeTemplate(), [row.first_name, row.verify_code]).catch((e) =>
      console.error('nudge template failed', e),
    );
  }
}

// Runs every post-save step. Each step is independent so one failure never blocks the others.
export async function processRequest(id: string): Promise<string> {
  const row = await loadRow(id);
  if (!row) return 'missing';
  await sendQualifiedEvent(row).catch((e) => console.error('QualifiedRFQ failed', e));

  if (env.crmProvider() === 'ghl') {
    // GHL first, so the customer email goes out from the GHL conversation and the owner is
    // notified by the GHL workflow. The owner email below only sends if Resend is configured.
    const result = row.status === 'synced' ? 'synced' : await syncToGhl(row, syncDeps());
    const fresh = (await loadRow(id)) || row;
    await ensurePdf(fresh).catch((e) => console.error('pdf failed', e));
    await emailCustomer(fresh).catch((e) => console.error('customer email failed', e));
    await alertOwner(fresh).catch((e) => console.error('owner alert failed', e));
    return result;
  }

  await emailCustomer(row).catch((e) => console.error('customer email failed', e));
  await alertOwner(row).catch((e) => console.error('owner alert failed', e));
  if (row.status === 'synced' || row.status === 'done') return row.status;
  if (env.crmProvider() !== 'ghl') {
    // No CRM: the lead lives in Supabase and on /admin. Retry later only if the owner was not told yet.
    const fresh = await loadRow(id);
    if (fresh && !fresh.owner_alert_sent && env.alertEmails().length) {
      await updateRow(id, { status: 'failed', attempts: row.attempts + 1, last_error: 'Owner alert email not sent', next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString() });
      return 'failed';
    }
    await updateRow(id, { status: 'done', last_error: null, next_attempt_at: null });
    return 'done';
  }
  return syncToGhl(row, syncDeps());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
