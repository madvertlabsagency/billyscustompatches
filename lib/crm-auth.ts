import 'server-only';
// Who is using the CRM right now, and in which client account. Every CRM page and action goes through here,
// so a team member only ever sees and changes the accounts they belong to.
import { redirect } from 'next/navigation';
import { db } from './supabase';
import { OWNER, readSession } from './admin-auth';
import type { TeamMember } from './crm';

export type Account = { id: string; slug: string; name: string; color: string; created_at: string; est_rfq_value?: number | string | null };
export type Ctx = { isOwner: boolean; member: TeamMember | null; account: Account; actor: string; accountRole: 'owner' | 'manager' | 'member' };

export async function accountsFor(user: string): Promise<Account[]> {
  if (user === OWNER) {
    const { data } = await db().from('crm_accounts').select('*').order('name');
    return (data || []) as Account[];
  }
  const { data } = await db().from('account_members').select('crm_accounts(*)').eq('member_id', user);
  return ((data || []) as unknown as { crm_accounts: Account | null }[]).map((r) => r.crm_accounts).filter((a): a is Account => !!a).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadMember(id: string): Promise<TeamMember | null> {
  const { data } = await db().from('team_members').select('id, name, email, role, color, active, created_at').eq('id', id).maybeSingle();
  return (data as TeamMember | null) || null;
}

// The signed in person, checked against the database on every request. null when not signed in.
export async function getUser(): Promise<{ isOwner: boolean; member: TeamMember | null; account: string } | null> {
  const s = await readSession();
  if (!s) return null;
  if (s.user === OWNER) return { isOwner: true, member: null, account: s.account };
  const member = await loadMember(s.user);
  if (!member || !member.active) return null;
  return { isOwner: false, member, account: s.account };
}

export async function getCtx(): Promise<Ctx | null> {
  const u = await getUser();
  if (!u || !u.account) return null;
  const { data } = await db().from('crm_accounts').select('*').eq('id', u.account).maybeSingle();
  const account = data as Account | null;
  if (!account) return null;
  let accountRole: Ctx['accountRole'] = 'owner';
  if (!u.isOwner) {
    const { data: m } = await db().from('account_members').select('role').eq('account_id', account.id).eq('member_id', u.member!.id).maybeSingle();
    if (!m) return null;
    accountRole = (m as { role: string }).role === 'manager' ? 'manager' : 'member';
  }
  return { isOwner: u.isOwner, member: u.member, account, actor: u.isOwner ? 'Madvert Labs admin' : u.member!.name, accountRole };
}

// For pages and actions: sends people to the login or the account picker when needed.
export async function requireCtx(): Promise<Ctx> {
  const u = await getUser();
  if (!u) redirect('/patches/login');
  const ctx = await getCtx();
  if (!ctx) redirect('/patches/accounts');
  return ctx;
}

export async function isAdmin(): Promise<boolean> {
  return !!(await getCtx());
}
