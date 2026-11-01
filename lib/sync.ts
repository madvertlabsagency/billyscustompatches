// GHL sync for one saved quote request. Every step is checkpointed on the row so a retry
// continues where the last attempt stopped and never creates a duplicate contact,
// note or opportunity.
import { GhlError, GhlSetupError, type GhlFieldName } from './ghl';
import { TAGS } from './scoring';
import { BUSINESS, formatDeadline } from './options';

export type QuoteRow = {
  id: string;
  created_at: string;
  status: string;
  attempts: number;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  ghl_note_done: boolean;
  ghl_assigned_user_id: string | null;
  is_repeat: boolean | null;
  email_sent?: boolean;
  welcome_sent?: boolean;
  owner_alert_sent?: boolean;
  nudge_sent_at?: string | null;
  lead_status?: string;
  owner_notes?: string | null;
  last_error?: string | null;
  whatsapp_from?: string | null;
  qualified_event_sent?: boolean;
  verify_code: string;
  whatsapp_verified_at: string | null;
  pdf_path: string | null;
  first_name: string;
  last_name: string;
  business: string | null;
  email: string;
  phone_e164: string;
  contact_method: string;
  patch_type: string;
  quantity: string;
  width: string | null;
  height: string | null;
  size_unsure: boolean;
  backing: string;
  deadline: string;
  deadline_date: string | null;
  notes: string | null;
  files: { path: string; name: string; size: number; ext: string }[];
  no_artwork: boolean;
  lead_score: number | null;
  lead_grade: string | null;
  tags: string[];
  tracking: Record<string, string | undefined>;
};

export interface GhlApi {
  findContact(email: string, phone: string): Promise<{ id: string } | null>;
  createContact(data: Record<string, unknown>): Promise<string>;
  updateContact(id: string, data: Record<string, unknown>): Promise<void>;
  addTags(id: string, tags: string[]): Promise<void>;
  addNote(id: string, body: string): Promise<void>;
  ensureFields(): Promise<Map<string, string>>;
  findPipeline(pipeline: string, stage: string): Promise<{ pipelineId: string; stageId: string }>;
  createOpportunity(d: { pipelineId: string; stageId: string; name: string; contactId: string; assignedTo?: string }): Promise<string>;
}

export interface Store {
  update(id: string, patch: Partial<QuoteRow> & Record<string, unknown>): Promise<void>;
}

export type SyncDeps = {
  ghl: GhlApi;
  store: Store;
  pipelineName: string;
  stageName: string;
  userIds: string[];
  nextRoundRobin: (size: number) => Promise<number>;
  links: { artwork: (path: string) => string; pdf: (path: string) => string };
  alert: (subject: string, body: string) => Promise<void>;
  now?: () => Date;
};

// Minutes to wait after attempt n fails (attempt 1 = first failure).
export const BACKOFF_MINUTES = [1, 5, 15, 60, 240];
export const MAX_BACKOFF_MINUTES = 360;

export function nextAttemptAt(attempts: number, now: Date): Date {
  const mins = BACKOFF_MINUTES[attempts - 1] ?? MAX_BACKOFF_MINUTES;
  return new Date(now.getTime() + mins * 60000);
}

export function quoteNumber(row: Pick<QuoteRow, 'verify_code'>): string {
  return row.verify_code;
}

export function summaryRows(row: QuoteRow): { k: string; v: string }[] {
  const rows = [
    { k: 'Patch type', v: row.patch_type },
    { k: 'Quantity', v: row.quantity },
    { k: 'Size', v: row.size_unsure ? 'Recommend for me' : `${row.width} x ${row.height} in` },
    { k: 'Backing', v: row.backing },
    {
      k: 'Artwork',
      v: row.files.length ? `${row.files.length} ${row.files.length === 1 ? 'file' : 'files'} received` : 'Design help needed',
    },
    { k: 'Deadline', v: formatDeadline(row.deadline, row.deadline_date || undefined) },
    { k: 'Preferred contact', v: row.contact_method },
  ];
  return rows;
}

// wa.me link that opens a chat with the customer, message prefilled (used in GHL notifications and /admin).
export function ownerWhatsAppLink(row: Pick<QuoteRow, 'first_name' | 'verify_code' | 'phone_e164'> & { whatsapp_from?: string | null }): string {
  const to = (row.whatsapp_from || row.phone_e164).replace(/\D/g, '');
  const text = `Hi ${row.first_name}, this is ${BUSINESS.name} about your patch quote ${row.verify_code}.`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// One line summary for notifications.
export function shortSummary(row: QuoteRow): string {
  const size = row.size_unsure ? 'size TBD' : `${row.width}x${row.height} in`;
  const art = row.files.length ? 'artwork uploaded' : 'no artwork';
  return `${row.quantity} ${row.patch_type}, ${size}, ${row.backing}, ${art}, deadline ${formatDeadline(row.deadline, row.deadline_date || undefined)}, score ${row.lead_score} (${row.lead_grade})`;
}

export function opportunityName(row: QuoteRow): string {
  const art = row.files.length ? 'Artwork Uploaded' : 'No Artwork';
  return `${row.first_name} ${row.last_name} | ${row.quantity} ${row.patch_type} | ${art}`;
}

export function noteBody(row: QuoteRow, artworkLinks: string[], pdfLink: string | null): string {
  const t = row.tracking || {};
  const lines = [
    `NEW QUOTE REQUEST ${row.verify_code}`,
    `Lead score: ${row.lead_score} (${row.lead_grade})`,
    ``,
    ...summaryRows(row).map((r) => `${r.k}: ${r.v}`),
    `Business: ${row.business || 'n/a'}`,
    `Email: ${row.email}`,
    `WhatsApp: ${row.phone_e164}`,
    `Notes: ${row.notes || 'none'}`,
    ``,
    `Artwork:`,
    ...(artworkLinks.length ? artworkLinks.map((l, i) => `${row.files[i]?.name}: ${l}`) : ['No artwork, design help needed']),
    ...(pdfLink ? [``, `Quote PDF: ${pdfLink}`] : []),
    ``,
    `Source: ${t.utm_source || 'n/a'} / ${t.utm_medium || 'n/a'} / ${t.utm_campaign || 'n/a'} / ${t.utm_content || 'n/a'}`,
    `Meta IDs: campaign ${t.meta_campaign_id || 'n/a'}, ad set ${t.meta_adset_id || 'n/a'}, ad ${t.meta_ad_id || 'n/a'}`,
    `Landing page: ${t.landing_page || 'n/a'}`,
    `Submitted: ${row.created_at}`,
  ];
  return lines.join('\n');
}

function fieldValues(row: QuoteRow, artworkLinks: string[], pdfLink: string | null): Record<GhlFieldName, string> {
  const t = row.tracking || {};
  return {
    'RFQ ID': row.id,
    'RFQ Patch Type': row.patch_type,
    'RFQ Quantity': row.quantity,
    'RFQ Width': row.size_unsure ? 'Recommend' : row.width || '',
    'RFQ Height': row.size_unsure ? 'Recommend' : row.height || '',
    'RFQ Backing': row.backing,
    'RFQ Deadline': formatDeadline(row.deadline, row.deadline_date || undefined),
    'RFQ Preferred Contact Method': row.contact_method,
    'RFQ Project Notes': row.notes || '',
    'RFQ Artwork URL': artworkLinks.join('\n'),
    'RFQ Quote PDF URL': pdfLink || '',
    'RFQ Landing Page': t.landing_page || '',
    'RFQ UTM Source': t.utm_source || '',
    'RFQ UTM Medium': t.utm_medium || '',
    'RFQ UTM Campaign': t.utm_campaign || '',
    'RFQ UTM Content': t.utm_content || '',
    'RFQ FBCLID': t.fbclid || '',
    'RFQ Meta Campaign ID': t.meta_campaign_id || '',
    'RFQ Meta Ad Set ID': t.meta_adset_id || '',
    'RFQ Meta Ad ID': t.meta_ad_id || '',
    'RFQ Submitted At': row.created_at,
    'RFQ Lead Score': String(row.lead_score ?? ''),
    'RFQ Lead Grade': row.lead_grade || '',
    'RFQ WhatsApp Verified': row.whatsapp_verified_at ? 'Yes' : 'No',
    'RFQ Verify Code': row.verify_code,
    'RFQ WhatsApp Link': ownerWhatsAppLink(row),
    'RFQ Summary': shortSummary(row),
  };
}

export async function syncToGhl(row: QuoteRow, deps: SyncDeps): Promise<'synced' | 'failed' | 'needs_setup'> {
  const now = deps.now ?? (() => new Date());
  const { ghl, store } = deps;
  const artworkLinks = row.files.map((f) => deps.links.artwork(f.path));
  const pdfLink = row.pdf_path ? deps.links.pdf(row.pdf_path) : null;
  try {
    // a. find or create the contact (never duplicate)
    let contactId = row.ghl_contact_id;
    let isRepeat = row.is_repeat;
    if (!contactId) {
      const existing = await ghl.findContact(row.email, row.phone_e164);
      isRepeat = !!existing;
      contactId = existing
        ? existing.id
        : await ghl.createContact({
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            phone: row.phone_e164,
            companyName: row.business || undefined,
            source: 'Quote funnel',
          });
      await store.update(row.id, { ghl_contact_id: contactId, is_repeat: isRepeat });
      row.ghl_contact_id = contactId;
      row.is_repeat = isRepeat;
    }

    // d. round robin owner, chosen once per request
    let owner = row.ghl_assigned_user_id;
    if (!owner && deps.userIds.length) {
      owner = deps.userIds[await deps.nextRoundRobin(deps.userIds.length)];
      await store.update(row.id, { ghl_assigned_user_id: owner });
      row.ghl_assigned_user_id = owner;
    }

    // b. custom fields (created if missing) and contact details
    const ids = await ghl.ensureFields();
    const values = fieldValues(row, artworkLinks, pdfLink);
    const customFields = Object.entries(values)
      .filter(([name]) => ids.has(name))
      .map(([name, value]) => ({ id: ids.get(name)!, field_value: value }));
    await ghl.updateContact(contactId, {
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone_e164,
      ...(row.business ? { companyName: row.business } : {}),
      ...(owner ? { assignedTo: owner } : {}),
      customFields,
    });

    // e. tags (GHL ignores tags the contact already has)
    const tags = [...row.tags, TAGS.newRfq, ...(isRepeat ? [TAGS.repeat] : []), row.whatsapp_verified_at ? TAGS.whatsappVerified : TAGS.whatsappPending];
    await ghl.addTags(contactId, tags);

    if (!row.ghl_note_done) {
      await ghl.addNote(contactId, noteBody(row, artworkLinks, pdfLink));
      await store.update(row.id, { ghl_note_done: true });
      row.ghl_note_done = true;
    }

    // c. opportunity
    if (!row.ghl_opportunity_id) {
      const { pipelineId, stageId } = await ghl.findPipeline(deps.pipelineName, deps.stageName);
      const oppId = await ghl.createOpportunity({ pipelineId, stageId, name: opportunityName(row), contactId, assignedTo: owner || undefined });
      await store.update(row.id, { ghl_opportunity_id: oppId });
      row.ghl_opportunity_id = oppId;
    }

    await store.update(row.id, { status: 'synced', last_error: null, next_attempt_at: null, updated_at: now().toISOString() });
    return 'synced';
  } catch (err) {
    const attempts = row.attempts + 1;
    const setup = err instanceof GhlSetupError;
    const message = err instanceof Error ? err.message : String(err);
    const status = setup ? 'needs_setup' : 'failed';
    const retryAt = setup ? new Date(now().getTime() + 60 * 60000) : nextAttemptAt(attempts, now());
    await store.update(row.id, {
      status,
      attempts,
      last_error: message.slice(0, 1000),
      next_attempt_at: retryAt.toISOString(),
      updated_at: now().toISOString(),
    });
    // Alert on the first failure and again when it keeps failing, without flooding the inbox.
    if (attempts === 1 || attempts === BACKOFF_MINUTES.length + 1 || setup) {
      await deps
        .alert(
          setup ? 'GHL setup needed' : `GHL sync failed (attempt ${attempts})`,
          `Quote ${row.verify_code} for ${row.first_name} ${row.last_name} (${row.email}, ${row.phone_e164}) is saved in Supabase but did not reach GHL.\n\nError: ${message}\n\nNext automatic retry: ${retryAt.toISOString()}`,
        )
        .catch(() => undefined);
    }
    if (err instanceof GhlError && !err.retryable && err.status !== 401 && err.status !== 403) {
      console.error('non retryable GHL error, will still retry on schedule', message);
    }
    return status;
  }
}
