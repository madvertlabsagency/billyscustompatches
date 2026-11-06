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
  const { data } = await db().from('quote_requests').select('lead_status').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  const from = (data as { lead_status: string }).lead_status;
  if (from === parsed.data.lead_status) return;
  await db().from('quote_requests').update({ lead_status: parsed.data.lead_status, updated_at: new Date().toISOString() }).eq('id', parsed.data.id);
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
