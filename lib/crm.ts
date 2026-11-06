import 'server-only';
// The partner CRM: pipeline stages, team members, lead owner and followers, and the activity timeline.
import { db } from './supabase';
import type { QuoteRow } from './sync';

export type Lead = QuoteRow & {
  assignee_id?: string | null;
  follower_ids?: string[] | null;
  updated_at?: string;
  opportunity_value?: number | string | null;
  source?: string | null;
  lost_reason?: string | null;
  quoted_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
};

export const leadValue = (l: Pick<Lead, 'opportunity_value'>) => {
  const n = Number(l.opportunity_value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export type Task = { id: string; lead_id: string; created_at: string; title: string; due_on: string | null; assignee_id: string | null; done_at: string | null };

export async function loadTasks(filter: { leadId?: string; open?: boolean } = {}): Promise<Task[]> {
  let q = db().from('lead_tasks').select('*').order('done_at', { ascending: true, nullsFirst: true }).order('due_on', { ascending: true, nullsFirst: false }).limit(1000);
  if (filter.leadId) q = q.eq('lead_id', filter.leadId);
  if (filter.open) q = q.is('done_at', null);
  const { data } = await q;
  return (data || []) as Task[];
}

// Today's date in the business time zone, as YYYY-MM-DD, to sort tasks into overdue, today and upcoming.
export const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function dueLabel(due: string | null): { text: string; tone: 'bad' | 'warn' | 'none' } {
  if (!due) return { text: 'No due date', tone: 'none' };
  const today = todayNY();
  const d = new Date(`${due}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (due < today) return { text: `Overdue, ${d}`, tone: 'bad' };
  if (due === today) return { text: 'Due today', tone: 'warn' };
  return { text: `Due ${d}`, tone: 'none' };
}

export const STAGES = [
  { key: 'new', label: 'New RFQ', color: '#0084ff' },
  { key: 'contacted', label: 'Contacted', color: '#7c5cff' },
  { key: 'quoted', label: 'Quote Sent', color: '#f59e0b' },
  { key: 'won', label: 'Won', color: '#0e8a4f' },
  { key: 'lost', label: 'Lost', color: '#c62828' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as [StageKey, ...StageKey[]];
export const stageOf = (k: string | null | undefined) => STAGES.find((s) => s.key === k) || STAGES[0];
export const stageIndex = (k: string | null | undefined) => Math.max(0, STAGES.findIndex((s) => s.key === k));

export type TeamMember = { id: string; name: string; email: string | null; role: string | null; color: string; active: boolean; created_at: string };

export const MEMBER_COLORS = ['#0084ff', '#7c5cff', '#00a884', '#f59e0b', '#e8467c', '#0ea5b7', '#6366f1', '#d9480f'];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export async function loadTeam(includeInactive = false): Promise<TeamMember[]> {
  let q = db().from('team_members').select('*').order('created_at', { ascending: true });
  if (!includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return (data || []) as TeamMember[];
}

export type Activity = { id: string; created_at: string; kind: string; text: string };

export async function logActivity(leadId: string, kind: string, text: string): Promise<void> {
  await db().from('lead_activity').insert({ lead_id: leadId, kind, text: text.slice(0, 500) });
}

export async function loadActivity(leadId: string): Promise<Activity[]> {
  const { data } = await db().from('lead_activity').select('id, created_at, kind, text').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200);
  return (data || []) as Activity[];
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
