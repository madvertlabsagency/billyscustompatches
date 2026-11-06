'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomInt, randomUUID } from 'node:crypto';
import { endSession, hashPassword, OWNER, passwordMatches, readSession, startSession, verifyPassword } from '@/lib/admin-auth';
import { accountsFor, requireCtx, getUser, type Ctx } from '@/lib/crm-auth';
import { db, rateLimit } from '@/lib/supabase';
import { env } from '@/lib/env';
import { addNote, parseNotes, removeNote, MAX_NOTE_LENGTH } from '@/lib/notes';
import { logActivity, MEMBER_COLORS, stageOf, STAGE_KEYS } from '@/lib/crm';
import { BUSINESS } from '@/lib/options';

// ---------- sign in ----------

async function clientIp(): Promise<string> {
  return ((await headers()).get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

// Team members sign in with email and password. The Madvert Labs admin signs in with the master password.
export async function login(_prev: string, form: FormData): Promise<string> {
  if (!(await rateLimit(`admin-login:${await clientIp()}`, 8, 900))) return 'Too many tries. Wait 15 minutes.';
  const password = String(form.get('password') || '');
  if (form.get('mode') === 'owner') {
    if (!passwordMatches(password)) return 'Wrong master password.';
    await startSession(OWNER);
    redirect('/admin/accounts');
  }
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!email || !password) return 'Enter your email and password.';
  const { data } = await db().from('team_members').select('id, password_hash, active').eq('email', email).maybeSingle();
  const row = data as { id: string; password_hash: string | null; active: boolean } | null;
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) return 'Wrong email or password.';
  await db().from('team_members').update({ last_login_at: new Date().toISOString() }).eq('id', row.id);
  await startSession(row.id);
  redirect('/admin/accounts');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin/login');
}

export async function selectAccount(form: FormData): Promise<void> {
  const s = await readSession();
  if (!s || !(await getUser())) redirect('/admin/login');
  const target = String(form.get('account_id') || '');
  const allowed = await accountsFor(s.user);
  if (!allowed.some((a) => a.id === target)) redirect('/admin/accounts');
  await startSession(s.user, target);
  redirect('/admin/welcome');
}

export async function changeMyPassword(_prev: string, form: FormData): Promise<string> {
  const u = await getUser();
  if (!u || u.isOwner || !u.member) return 'Only team members can change their password here.';
  const current = String(form.get('current') || '');
  const next = String(form.get('next') || '');
  if (next.length < 8) return 'The new password needs at least 8 characters.';
  const { data } = await db().from('team_members').select('password_hash').eq('id', u.member.id).maybeSingle();
  if (!verifyPassword(current, (data as { password_hash: string | null } | null)?.password_hash)) return 'Your current password is not right.';
  await db().from('team_members').update({ password_hash: hashPassword(next) }).eq('id', u.member.id);
  return 'Password changed.';
}

// ---------- helpers ----------

const id = z.string().uuid();
const optionalId = z.union([id, z.literal('')]);

// Every CRM page reads the same rows, so refresh them all after a change.
const refresh = () => revalidatePath('/admin', 'layout');

// A lead of the open account, or null when it belongs to another client.
async function leadOf<T>(ctx: Ctx, leadId: string, cols: string): Promise<T | null> {
  const { data } = await db().from('quote_requests').select(cols).eq('id', leadId).eq('account_id', ctx.account.id).maybeSingle();
  return (data as T | null) || null;
}

async function inAccount(ctx: Ctx, memberId: string): Promise<string | null> {
  const { data } = await db().from('account_members').select('team_members(name)').eq('account_id', ctx.account.id).eq('member_id', memberId).maybeSingle();
  return (data as unknown as { team_members: { name: string } | null } | null)?.team_members?.name || null;
}

const canManage = (ctx: Ctx) => ctx.isOwner || ctx.accountRole === 'manager';

// ---------- pipeline ----------

// One tap moves the lead to another stage, like dragging a card in a CRM pipeline.
export async function moveLead(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, lead_status: z.enum(STAGE_KEYS) }).safeParse({ id: form.get('id'), lead_status: form.get('lead_status') });
  if (!parsed.success) return;
  const row = await leadOf<{ lead_status: string; quoted_at: string | null; won_at: string | null; lost_at: string | null }>(ctx, parsed.data.id, 'lead_status, quoted_at, won_at, lost_at');
  if (!row) return;
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
  await logActivity(parsed.data.id, 'stage', `Moved from ${stageOf(from).label} to ${stageOf(to).label}`, ctx.actor);
  refresh();
}

// ---------- notes ----------

export async function addLeadNote(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, text: z.string().trim().min(1).max(MAX_NOTE_LENGTH) }).safeParse({ id: form.get('id'), text: String(form.get('text') || '') });
  if (!parsed.success) return;
  const row = await leadOf<{ owner_notes: string | null }>(ctx, parsed.data.id, 'owner_notes');
  if (!row) return;
  await db().from('quote_requests').update({ owner_notes: addNote(row.owner_notes, `${parsed.data.text}`), updated_at: new Date().toISOString() }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'note', `Note added: ${parsed.data.text.slice(0, 140)}`, ctx.actor);
  refresh();
}

export async function deleteLeadNote(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, index: z.coerce.number().int().min(0) }).safeParse({ id: form.get('id'), index: form.get('index') });
  if (!parsed.success) return;
  const row = await leadOf<{ owner_notes: string | null }>(ctx, parsed.data.id, 'owner_notes');
  if (!row) return;
  const gone = parseNotes(row.owner_notes)[parsed.data.index];
  if (!gone) return;
  await db().from('quote_requests').update({ owner_notes: removeNote(row.owner_notes, parsed.data.index) }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'note', `Note deleted: ${gone.text.slice(0, 140)}`, ctx.actor);
  refresh();
}

// ---------- owner and followers ----------

export async function assignLead(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, assignee_id: optionalId }).safeParse({ id: form.get('id'), assignee_id: String(form.get('assignee_id') || '') });
  if (!parsed.success || !(await leadOf(ctx, parsed.data.id, 'id'))) return;
  const assignee = parsed.data.assignee_id || null;
  const name = assignee ? await inAccount(ctx, assignee) : null;
  if (assignee && !name) return;
  await db().from('quote_requests').update({ assignee_id: assignee, updated_at: new Date().toISOString() }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'owner', assignee ? `Owner set to ${name}` : 'Owner removed', ctx.actor);
  refresh();
}

export async function toggleFollower(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, member_id: id }).safeParse({ id: form.get('id'), member_id: form.get('member_id') });
  if (!parsed.success) return;
  const row = await leadOf<{ follower_ids: string[] | null }>(ctx, parsed.data.id, 'follower_ids');
  const name = await inAccount(ctx, parsed.data.member_id);
  if (!row || !name) return;
  const current = row.follower_ids || [];
  const following = current.includes(parsed.data.member_id);
  const next = following ? current.filter((m) => m !== parsed.data.member_id) : [...current, parsed.data.member_id];
  await db().from('quote_requests').update({ follower_ids: next }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'follower', following ? `${name} stopped following` : `${name} is now following`, ctx.actor);
  refresh();
}

// ---------- team ----------

// Adds a person to this account. With an email and password they can sign in to the app.
// The same email in another client account is the same person, so they keep one login.
export async function addTeamMember(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  if (!canManage(ctx)) redirect('/admin/team?error=rights');
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.union([z.string().trim().toLowerCase().email().max(160), z.literal('')]),
      role: z.string().trim().max(60),
      password: z.union([z.string().min(8).max(200), z.literal('')]),
      account_role: z.enum(['member', 'manager']),
    })
    .safeParse({ name: String(form.get('name') || ''), email: String(form.get('email') || ''), role: String(form.get('role') || ''), password: String(form.get('password') || ''), account_role: String(form.get('account_role') || 'member') });
  if (!parsed.success) redirect('/admin/team?error=form');
  const d = parsed.data;
  if (d.password && !d.email) redirect('/admin/team?error=email');
  let memberId = '';
  if (d.email) {
    const { data } = await db().from('team_members').select('id').eq('email', d.email).maybeSingle();
    memberId = (data as { id: string } | null)?.id || '';
    if (memberId && d.password) await db().from('team_members').update({ password_hash: hashPassword(d.password), active: true }).eq('id', memberId);
  }
  if (!memberId) {
    const { count } = await db().from('team_members').select('id', { count: 'exact', head: true });
    const { data, error } = await db()
      .from('team_members')
      .insert({ name: d.name, email: d.email || null, role: d.role || null, color: MEMBER_COLORS[(count || 0) % MEMBER_COLORS.length], password_hash: d.password ? hashPassword(d.password) : null })
      .select('id')
      .single();
    if (error || !data) redirect('/admin/team?error=save');
    memberId = (data as { id: string }).id;
  }
  await db().from('account_members').upsert({ account_id: ctx.account.id, member_id: memberId, role: d.account_role });
  refresh();
  redirect('/admin/team?added=1');
}

export async function setMemberPassword(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  if (!canManage(ctx)) redirect('/admin/team?error=rights');
  const parsed = z.object({ member_id: id, password: z.string().min(8).max(200) }).safeParse({ member_id: form.get('member_id'), password: String(form.get('password') || '') });
  if (!parsed.success || !(await inAccount(ctx, parsed.data.member_id))) redirect('/admin/team?error=password');
  const { data } = await db().from('team_members').select('email').eq('id', parsed.data.member_id).maybeSingle();
  if (!(data as { email: string | null } | null)?.email) redirect('/admin/team?error=email');
  await db().from('team_members').update({ password_hash: hashPassword(parsed.data.password) }).eq('id', parsed.data.member_id);
  refresh();
  redirect('/admin/team?password=1');
}

// Removing a member from this account keeps its history readable: their leads here become unassigned
// and they leave this account's follower lists. A person left in no account at all is deleted.
export async function removeTeamMember(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  if (!canManage(ctx)) redirect('/admin/team?error=rights');
  const parsed = id.safeParse(form.get('member_id'));
  if (!parsed.success) return;
  const name = await inAccount(ctx, parsed.data);
  if (!name) return;
  const acc = ctx.account.id;
  const { data: owned } = await db().from('quote_requests').select('id').eq('account_id', acc).eq('assignee_id', parsed.data);
  await db().from('quote_requests').update({ assignee_id: null }).eq('account_id', acc).eq('assignee_id', parsed.data);
  const { data: followed } = await db().from('quote_requests').select('id, follower_ids').eq('account_id', acc).contains('follower_ids', [parsed.data]);
  for (const row of (followed || []) as { id: string; follower_ids: string[] }[]) {
    await db().from('quote_requests').update({ follower_ids: row.follower_ids.filter((m) => m !== parsed.data) }).eq('id', row.id);
  }
  await db().from('lead_tasks').update({ assignee_id: null }).eq('account_id', acc).eq('assignee_id', parsed.data);
  await db().from('account_members').delete().eq('account_id', acc).eq('member_id', parsed.data);
  const { count } = await db().from('account_members').select('member_id', { count: 'exact', head: true }).eq('member_id', parsed.data);
  if (!count) await db().from('team_members').delete().eq('id', parsed.data);
  for (const row of (owned || []) as { id: string }[]) await logActivity(row.id, 'owner', `Owner removed (${name} left the team)`, ctx.actor);
  refresh();
}

// ---------- client accounts (Madvert Labs admin only) ----------

export async function createAccount(form: FormData): Promise<void> {
  const u = await getUser();
  if (!u?.isOwner) redirect('/admin/accounts');
  const name = String(form.get('name') || '').trim().slice(0, 80);
  if (!name) redirect('/admin/accounts?error=name');
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'client';
  for (let i = 0; i < 5; i++) {
    const slug = i ? `${base}-${randomInt(10, 99)}` : base;
    const { error } = await db().from('crm_accounts').insert({ name, slug, color: MEMBER_COLORS[randomInt(0, MEMBER_COLORS.length)] });
    if (!error) break;
    if (!/duplicate|unique/i.test(error.message)) redirect('/admin/accounts?error=save');
  }
  refresh();
  redirect('/admin/accounts');
}

// ---------- delete ----------

// Deletes the lead for good, with its artwork and quote PDF in storage. Its activity and tasks go with it.
export async function deleteLead(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = id.safeParse(form.get('id'));
  if (!parsed.success) return;
  const row = await leadOf<{ files: { path: string }[] | null; pdf_path: string | null }>(ctx, parsed.data, 'files, pdf_path');
  if (!row) return;
  const paths = [...(row.files || []).map((f) => f.path), row.pdf_path].filter((p): p is string => !!p);
  if (paths.length) await db().storage.from(env.artworkBucket()).remove(paths);
  await db().from('quote_requests').delete().eq('id', parsed.data).eq('account_id', ctx.account.id);
  refresh();
  if (form.get('back') === 'pipeline') redirect('/admin');
}

// ---------- deal value and lost reason ----------

export async function setLeadValue(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const raw = String(form.get('value') || '').replace(/[$,\s]/g, '');
  const parsed = z.object({ id, value: z.union([z.literal(''), z.coerce.number().min(0).max(10_000_000)]) }).safeParse({ id: form.get('id'), value: raw });
  if (!parsed.success || !(await leadOf(ctx, parsed.data.id, 'id'))) return;
  const value = parsed.data.value === '' ? null : Math.round(Number(parsed.data.value) * 100) / 100;
  await db().from('quote_requests').update({ opportunity_value: value, updated_at: new Date().toISOString() }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'value', value === null ? 'Opportunity value cleared' : `Opportunity value set to $${value.toLocaleString('en-US')}`, ctx.actor);
  refresh();
}

export async function setLostReason(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z.object({ id, reason: z.string().trim().max(200) }).safeParse({ id: form.get('id'), reason: String(form.get('reason') || '') });
  if (!parsed.success || !(await leadOf(ctx, parsed.data.id, 'id'))) return;
  await db().from('quote_requests').update({ lost_reason: parsed.data.reason || null }).eq('id', parsed.data.id);
  await logActivity(parsed.data.id, 'stage', parsed.data.reason ? `Lost reason: ${parsed.data.reason}` : 'Lost reason cleared', ctx.actor);
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
  const ctx = await requireCtx();
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
  if (d.assignee_id && !(await inAccount(ctx, d.assignee_id))) redirect('/admin/contacts/new?error=1');
  const value = Number(d.value.replace(/[$,\s]/g, ''));
  const now = new Date().toISOString();
  const row = {
    account_id: ctx.account.id,
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
  await logActivity(newId, 'created', 'Contact added by hand on the portal', ctx.actor);
  refresh();
  redirect(`/admin/lead/${newId}`);
}

// ---------- tasks ----------

export async function addTask(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = z
    .object({ id, title: z.string().trim().min(1).max(200), due_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]), assignee_id: optionalId })
    .safeParse({ id: form.get('id'), title: String(form.get('title') || ''), due_on: String(form.get('due_on') || ''), assignee_id: String(form.get('assignee_id') || '') });
  if (!parsed.success || !(await leadOf(ctx, parsed.data.id, 'id'))) return;
  const d = parsed.data;
  const who = d.assignee_id ? await inAccount(ctx, d.assignee_id) : null;
  if (d.assignee_id && !who) return;
  await db().from('lead_tasks').insert({ account_id: ctx.account.id, lead_id: d.id, title: d.title, due_on: d.due_on || null, assignee_id: d.assignee_id || null });
  await logActivity(d.id, 'task', `Task added${who ? ` for ${who}` : ''}: ${d.title}${d.due_on ? ` (due ${d.due_on})` : ''}`, ctx.actor);
  refresh();
}

async function taskOf(ctx: Ctx, taskId: string) {
  const { data } = await db().from('lead_tasks').select('lead_id, title, done_at').eq('id', taskId).eq('account_id', ctx.account.id).maybeSingle();
  return data as { lead_id: string; title: string; done_at: string | null } | null;
}

export async function toggleTask(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = id.safeParse(form.get('task_id'));
  if (!parsed.success) return;
  const t = await taskOf(ctx, parsed.data);
  if (!t) return;
  await db().from('lead_tasks').update({ done_at: t.done_at ? null : new Date().toISOString() }).eq('id', parsed.data);
  await logActivity(t.lead_id, 'task', t.done_at ? `Task reopened: ${t.title}` : `Task completed: ${t.title}`, ctx.actor);
  refresh();
}

export async function deleteTask(form: FormData): Promise<void> {
  const ctx = await requireCtx();
  const parsed = id.safeParse(form.get('task_id'));
  if (!parsed.success) return;
  const t = await taskOf(ctx, parsed.data);
  if (!t) return;
  await db().from('lead_tasks').delete().eq('id', parsed.data);
  await logActivity(t.lead_id, 'task', `Task deleted: ${t.title}`, ctx.actor);
  refresh();
}
