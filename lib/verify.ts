import 'server-only';
import { env } from './env';
import { Ghl } from './ghl';
import { TAGS } from './scoring';
import { ensurePdf, loadRow, processRequest, signedUrl, updateRow } from './service';
import { sendWhatsApp, welcomeMessage } from './whatsapp';
import type { QuoteRow } from './sync';

// Marks a request WhatsApp verified, updates GHL, then sends the welcome message and quote PDF.
export async function verifyAndWelcome(row: QuoteRow, fromE164: string, ghlContactHint: string | null = null): Promise<void> {
  if (!row.whatsapp_verified_at) {
    await updateRow(row.id, {
      whatsapp_verified_at: new Date().toISOString(),
      whatsapp_from: fromE164,
      lead_status: row.lead_status === 'new' || !row.lead_status ? 'contacted' : row.lead_status,
    });
  }

  // With GHL, make sure the contact exists before replying through it.
  let fresh = (await loadRow(row.id)) || row;
  if (env.crmProvider() === 'ghl' && !fresh.ghl_contact_id) {
    await processRequest(row.id).catch(() => undefined);
    fresh = (await loadRow(row.id)) || fresh;
  }
  const contactId = fresh.ghl_contact_id || ghlContactHint;

  if (env.crmProvider() === 'ghl' && contactId && env.ghlToken()) {
    const ghl = new Ghl(env.ghlToken(), env.ghlLocationId(), env.ghlBase());
    await ghl.addTags(contactId, [TAGS.whatsappVerified]).catch(() => undefined);
    await ghl.removeTags(contactId, [TAGS.whatsappPending]).catch(() => undefined);
    const ids = await ghl.ensureFields().catch(() => null);
    const fid = ids?.get('RFQ WhatsApp Verified');
    if (fid) await ghl.updateContact(contactId, { customFields: [{ id: fid, field_value: 'Yes' }] }).catch(() => undefined);
    if (fromE164 !== fresh.phone_e164) {
      await ghl
        .addNote(contactId, `WhatsApp verified from ${fromE164}, which differs from the number on the form (${fresh.phone_e164}). Use ${fromE164} for WhatsApp.`)
        .catch(() => undefined);
    }
  }

  const { path } = await ensurePdf(fresh);
  const pdfUrl = (await signedUrl(path)) || undefined;
  try {
    await sendWhatsApp({
      toE164: fromE164,
      ghlContactId: contactId,
      text: welcomeMessage(fresh.first_name, fresh.verify_code),
      pdfUrl,
      pdfName: `Custom-Patch-Lab-Quote-${fresh.verify_code}.pdf`,
    });
  } catch (e) {
    // Not marked as sent, so the customer's next WhatsApp message tries again.
    await updateRow(row.id, { last_error: `WhatsApp reply failed: ${e instanceof Error ? e.message : e}`.slice(0, 1000) }).catch(() => undefined);
    throw e;
  }
  await updateRow(row.id, { welcome_sent: true });
}
