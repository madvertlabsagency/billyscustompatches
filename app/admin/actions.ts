'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { endSession, isAdmin, passwordMatches, startSession } from '@/lib/admin-auth';
import { db, rateLimit } from '@/lib/supabase';
import { env } from '@/lib/env';
import { addNote, parseNotes, removeNote, MAX_NOTE_LENGTH } from '@/lib/notes';
import { logActivity, MEMBER_COLORS, stageOf, STAGE_KEYS } from '@/lib/crm';
import { BUSINESS } from '@/lib/options';
import { randomInt, randomUUID } from 'node:crypto';

export async function login(_prev: string, form: FormData): Promise<string> {
  const ip = ((await headers()).get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!(await rateLimit(`admin-login:${ip}`, 8, 900))) return 'Too many tries. Wait 15 minutes.';
  if (!passwordMatches(String(form.get('password') || ''))) return 'Wrong password.';
  await startSession();
  redirect('/admin/welcome');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin/login');
}

const id = z.string().uuid();
const optionalId = z.union([id, z.literal('')]);

async function guard(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

// Every CRM page reads the same rows, so refresh them all after a change.
const refresh = () => revalidatePath('/admin', 'layout');

async function memberName(memberId: string): Promise<string> {
  const { data } = await db().from('team_members').select('name').eq('id', memberId).maybeSingle();
  return (data as { name: string } | null)?.name || 'a team member';
}

// ---------- pipeline ----------

// One tap moves the lead to another stage, like dragging a card in a CRM pipeline.
export async function moveLead(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, lead_status: z.enum(STAGE_KEYS) }).safeParse({ id: form.get('id'), lead_status: form.get('lead_status') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('lead_status, quoted_at, won_at, lost_at').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  const row = data as { lead_status: string; quoted_at: string | null; won_at: string | null; lost_at: string | null };
  const from = row.lead_status;
  const to = parsed.data.lead_status;
  if (from === to) return;
  const now = new Date().toISOString();
  // Stage dates feed the dashboard ratios: a won deal also counts as quoted.
  const patch: Record<string, string> = { lead_status: to, updated_at: now };
  if ((to === 'quoted' || to === 'won') && !row.quoted_at) patch.quoted_at = now;
  if (to === 'won' && !row.won_at) patch.won_at = now;
  if (to === 'lost' && !row.lost_at) patch.lost_at = now;
  await db().from('quote_requests').update(patch).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'stage', `Moved from ${stageOf(from).label} to ${stageOf(parsed.data.lead_status).label}`);
  refresh();
}

// ---------- notes ----------

export async function addLeadNote(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, text: z.string().trim().min(1).max(MAX_NOTE_LENGTH) }).safeParse({ id: form.get('id'), text: String(form.get('text') || '') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('owner_notes').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  await db().from('quote_requests').update({ owner_notes: addNote((data as { owner_notes: string | null }).owner_notes, parsed.data.text) }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'note', `Note added: ${parsed.data.text.slice(0, 140)}`);
  refresh();
}

export async function deleteLeadNote(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, index: z.coerce.number().int().min(0) }).safeParse({ id: form.get('id'), index: form.get('index') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('owner_notes').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  const raw = (data as { owner_notes: string | null }).owner_notes;
  const gone = parseNotes(raw)[parsed.data.index];
  if (!gone) return;
  await db().from('quote_requests').update({ owner_notes: removeNote(raw, parsed.data.index) }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'note', `Note deleted: ${gone.text.slice(0, 140)}`);
  refresh();
}

// ---------- owner and followers ----------

export async function assignLead(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, assignee_id: optionalId }).safeParse({ id: form.get('id'), assignee_id: String(form.get('assignee_id') || '') });
  if (!parsed.success) return;
  const assignee = parsed.data.assignee_id || null;
  await db().from('quote_requests').update({ assignee_id: assignee }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'owner', assignee ? `Owner set to ${await memberName(assignee)}` : 'Owner removed');
  refresh();
}

export async function toggleFollower(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, member_id: id }).safeParse({ id: form.get('id'), member_id: form.get('member_id') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('follower_ids').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  const current = ((data as { follower_ids: string[] | null }).follower_ids || []) as string[];
  const following = current.includes(parsed.data.member_id);
  const next = following ? current.filter((m) => m !== parsed.data.member_id) : [...current, parsed.data.member_id];
  await db().from('quote_requests').update({ follower_ids: next }).eq('id', parsed.data.id);
  const name = await memberName(parsed.data.member_id);
  await logActivity(parsed.data.id, 'follower', following ? `${name} stopped following` : `${name} is now following`);
  refresh();
}

// ---------- team ----------

export async function addTeamMember(form: FormData): Promise<void> {
  await guard();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.union([z.string().trim().email().max(160), z.literal('')]),
      role: z.string().trim().max(60),
    })
    .safeParse({ name: String(form.get('name') || ''), email: String(form.get('email') || ''), role: String(form.get('role') || '') });
  if (!parsed.success) return;
  const { count } = await db().from('team_members').select('id', { count: 'exact', head: true });
  await db().from('team_members').insert({
    name: parsed.data.name,
    email: parsed.data.email || null,
    role: parsed.data.role || null,
    color: MEMBER_COLORS[(count || 0) % MEMBER_COLORS.length],
  });
  refresh();
}

// Removing a member keeps history readable: their leads become unassigned and they leave every follower list.
export async function removeTeamMember(form: FormData): Promise<void> {
  await guard();
  const parsed = id.safeParse(form.get('member_id'));
  if (!parsed.success) return;
  const { data: owned } = await db().from('quote_requests').select('id').eq('assignee_id', parsed.data);
  await db().from('quote_requests').update({ assignee_id: null }).eq('assignee_id', parsed.data);
  const { data: followed } = await db().from('quote_requests').select('id, follower_ids').contains('follower_ids', [parsed.data]);
  for (const row of (followed || []) as { id: string; follower_ids: string[] }[]) {
    await db().from('quote_requests').update({ follower_ids: row.follower_ids.filter((m) => m !== parsed.data) }).eq('id', row.id);
  }
  const name = await memberName(parsed.data);
  await db().from('team_members').delete().eq('id', parsed.data);
  for (const row of (owned || []) as { id: string }[]) await logActivity(row.id, 'owner', `Owner removed (${name} left the team)`);
  refresh();
}

// ---------- delete ----------

// Deletes the lead for good, with its artwork and quote PDF in storage. Its activity goes with it.
export async function deleteLead(form: FormData): Promise<void> {
  await guard();
  const parsed = id.safeParse(form.get('id'));
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('files, pdf_path').eq('id', parsed.data).maybeSingle();
  if (!data) return;
  const row = data as { files: { path: string }[] | null; pdf_path: string | null };
  const paths = [...(row.files || []).map((f) => f.path), row.pdf_path].filter((p): p is string => !!p);
  if (paths.length) await db().storage.from(env.artworkBucket()).remove(paths);
  await db().from('quote_requests').delete().eq('id', parsed.data);
  refresh();
  if (form.get('back') === 'pipeline') redirect('/admin');
}

// ---------- deal value and lost reason ----------

export async function setLeadValue(form: FormData): Promise<void> {
  await guard();
  const raw = String(form.get('value') || '').replace(/[$,\s]/g, '');
  const parsed = z.object({ id, value: z.union([z.literal(''), z.coerce.number().min(0).max(10_000_000)]) }).safeParse({ id: form.get('id'), value: raw });
  if (!parsed.success) return;
  const value = parsed.data.value === '' ? null : Math.round(Number(parsed.data.value) * 100) / 100;
  await db().from('quote_requests').update({ opportunity_value: value }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'value', value === null ? 'Opportunity value cleared' : `Opportunity value set to $${value.toLocaleString('en-US')}`);
  refresh();
}

export async function setLostReason(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, reason: z.string().trim().max(200) }).safeParse({ id: form.get('id'), reason: String(form.get('reason') || '') });
  if (!parsed.success) return;
  await db().from('quote_requests').update({ lost_reason: parsed.data.reason || null }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'stage', parsed.data.reason ? `Lost reason: ${parsed.data.reason}` : 'Lost reason cleared');
  refresh();
}

// ---------- add a contact by hand ----------

const phoneE164 = (raw: string) => {
  const t = raw.trim();
  if (!t) return '';
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

const CONTACT_FIELDS = ['first_name', 'last_name', 'business', 'email', 'phone', 'patch_type', 'quantity', 'value', 'lead_status', 'assignee_id', 'note'] as const;

// A lead added by hand never triggers the funnel automations: no customer email, no WhatsApp reply or nudge, no ad event.
export async function createContact(form: FormData): Promise<void> {
  await guard();
  const parsed = z
    .object({
      first_name: z.string().trim().min(1).max(60),
      last_name: z.string().trim().max(60),
      business: z.string().trim().max(120),
      email: z.union([z.string().trim().email().max(160), z.literal('')]),
      phone: z.string().trim().max(30),
      patch_type: z.string().trim().max(60),
      quantity: z.string().trim().max(40),
      value: z.string().trim().max(20),
      lead_status: z.enum(STAGE_KEYS),
      assignee_id: optionalId,
      note: z.string().trim().max(MAX_NOTE_LENGTH),
    })
    .safeParse(Object.fromEntries(CONTACT_FIELDS.map((k) => [k, String(form.get(k) || '')])));
  if (!parsed.success || (!parsed.data.email && !parsed.data.phone)) redirect('/admin/contacts/new?error=1');
  const d = parsed.data;
  const value = Number(d.value.replace(/[$,\s]/g, ''));
  const now = new Date().toISOString();
  const row = {
    status: 'done',
    email_sent: true,
    owner_alert_sent: true,
    welcome_sent: true,
    qualified_event_sent: true,
    nudge_sent_at: now,
    event_id: randomUUID(),
    first_name: d.first_name,
    last_name: d.last_name || '',
    business: d.business || null,
    email: d.email,
    phone_e164: phoneE164(d.phone),
    contact_method: d.phone ? 'Phone' : 'Email',
    patch_type: d.patch_type || 'Not specified',
    quantity: d.quantity || 'Not specified',
    size_unsure: true,
    backing: 'Not specified',
    deadline: 'Not specified',
    no_artwork: true,
    tags: ['MANUAL'],
    tracking: {},
    source: 'manual',
    lead_status: d.lead_status,
    assignee_id: d.assignee_id || null,
    opportunity_value: Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null,
    owner_notes: d.note ? addNote(null, d.note) : null,
    quoted_at: d.lead_status === 'quoted' || d.lead_status === 'won' ? now : null,
    won_at: d.lead_status === 'won' ? now : null,
    lost_at: d.lead_status === 'lost' ? now : null,
  };
  let newId = '';
  for (let i = 0; i < 5 && !newId; i++) {
    const { data, error } = await db().from('quote_requests').insert({ ...row, verify_code: `${BUSINESS.codePrefix}-${randomInt(100000, 1000000)}` }).select('id').single();
    if (data) newId = (data as { id: string }).id;
    else if (error && !/duplicate|unique/i.test(error.message)) {
      console.error('create contact failed', error.message);
      break;
    }
  }
  if (!newId) redirect('/admin/contacts/new?error=save');
  await logActivity(newId, 'created', 'Contact added by hand on the portal');
  refresh();
  redirect(`/admin/lead/${newId}`);
}

// ---------- tasks ----------

export async function addTask(form: FormData): Promise<void> {
  await guard();
  const parsed = z
    .object({ id, title: z.string().trim().min(1).max(200), due_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]), assignee_id: optionalId })
    .safeParse({ id: form.get('id'), title: String(form.get('title') || ''), due_on: String(form.get('due_on') || ''), assignee_id: String(form.get('assignee_id') || '') });
  if (!parsed.success) return;
  const d = parsed.data;
  await db().from('lead_tasks').insert({ lead_id: d.id, title: d.title, due_on: d.due_on || null, assignee_id: d.assignee_id || null });
  const who = d.assignee_id ? ` for ${await memberName(d.assignee_id)}` : '';
  await logActivity(d.id, 'task', `Task added${who}: ${d.title}${d.due_on ? ` (due ${d.due_on})` : ''}`);
  refresh();
}

export async function toggleTask(form: FormData): Promise<void> {
  await guard();
  const parsed = id.safeParse(form.get('task_id'));
  if (!parsed.success) return;
  const { data } = await db().from('lead_tasks').select('lead_id, title, done_at').eq('id', parsed.data).maybeSingle();
  if (!data) return;
  const t = data as { lead_id: string; title: string; done_at: string | null };
  await db().from('lead_tasks').update({ done_at: t.done_at ? null : new Date().toISOString() }).eq('id', parsed.data);
  await logActivity(t.lead_id, 'task', t.done_at ? `Task reopened: ${t.title}` : `Task completed: ${t.title}`);
  refresh();
}

export async function deleteTask(form: FormData): Promise<void> {
  await guard();
  const parsed = id.safeParse(form.get('task_id'));
  if (!parsed.success) return;
  const { data } = await db().from('lead_tasks').select('lead_id, title').eq('id', parsed.data).maybeSingle();
  if (!data) return;
  const t = data as { lead_id: string; title: string };
  await db().from('lead_tasks').delete().eq('id', parsed.data);
  await logActivity(t.lead_id, 'task', `Task deleted: ${t.title}`);
  refresh();
}
