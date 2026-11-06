// The Notifications tab: what needs the team's attention right now. Pure, so it is tested without a database.
export type AlertLead = {
  id: string;
  first_name: string;
  last_name: string;
  quantity: string;
  patch_type: string;
  created_at: string;
  lead_status: string | null;
  assignee_id: string | null;
  lead_grade: string | null;
  lead_score: number | null;
  tags: string[] | null;
};
export type AlertTask = { id: string; lead_id: string; title: string; due_on: string | null; done_at: string | null };
export type Alert = { id: string; level: 'urgent' | 'warn' | 'info'; title: string; body: string; href: string; at: string };

const HOUR = 3600000;
const DAY = 24 * HOUR;
const days = (ms: number) => Math.max(1, Math.floor(ms / DAY));
const nameOf = (l: AlertLead) => `${l.first_name} ${l.last_name}`.trim() || 'A lead';

export function computeAlerts(input: { leads: AlertLead[]; lastTouch: Map<string, string>; tasks: AlertTask[]; now: number; today: string }): Alert[] {
  const { leads, lastTouch, tasks, now, today } = input;
  const out: Alert[] = [];
  const byId = new Map(leads.map((l) => [l.id, l]));
  for (const l of leads) {
    const s = l.lead_status || 'new';
    const created = new Date(l.created_at).getTime();
    const touched = new Date(lastTouch.get(l.id) || l.created_at).getTime();
    const idle = now - touched;
    const href = `/patches/lead/${l.id}`;
    const hot = (l.tags || []).includes('RUSH ORDER') || l.lead_grade === 'Very high';
    if (now - created < 2 * DAY) {
      out.push({ id: `new-${l.id}`, level: hot ? 'urgent' : 'info', title: `New RFQ: ${nameOf(l)}`, body: `${l.quantity} ${l.patch_type}${l.lead_grade ? `, ${hot ? 'URGENT, ' : ''}${l.lead_grade}${l.lead_score !== null ? ` (${l.lead_score})` : ''}` : ''}`, href, at: l.created_at });
    }
    if (s === 'new' && idle > DAY) {
      out.push({ id: `wait-${l.id}`, level: 'urgent', title: `${nameOf(l)} has waited ${days(idle)} day${days(idle) === 1 ? '' : 's'} in New RFQ`, body: 'Contact them and move the lead to Contacted.', href, at: new Date(touched).toISOString() });
    } else if (s === 'quoted' && idle > 3 * DAY) {
      out.push({ id: `quote-${l.id}`, level: 'warn', title: `Follow up on the quote for ${nameOf(l)}`, body: `No update for ${days(idle)} days since the quote. Call or WhatsApp them, then update the stage.`, href, at: new Date(touched).toISOString() });
    } else if (s === 'contacted' && idle > 2 * DAY) {
      out.push({ id: `idle-${l.id}`, level: 'warn', title: `No update on ${nameOf(l)} for ${days(idle)} days`, body: 'Update the stage or add a note so the lead does not go cold.', href, at: new Date(touched).toISOString() });
    }
    if ((s === 'new' || s === 'contacted' || s === 'quoted') && !l.assignee_id && now - created > 2 * HOUR) {
      out.push({ id: `owner-${l.id}`, level: 'warn', title: `${nameOf(l)} has no owner`, body: 'Assign someone so this lead is not missed.', href, at: l.created_at });
    }
  }
  for (const t of tasks) {
    if (t.done_at || !t.due_on) continue;
    const lead = byId.get(t.lead_id);
    const href = `/patches/lead/${t.lead_id}?tab=tasks`;
    if (t.due_on < today) out.push({ id: `task-${t.id}`, level: 'urgent', title: `Overdue task: ${t.title}`, body: `${lead ? nameOf(lead) : 'Lead'}, was due ${t.due_on}.`, href, at: `${t.due_on}T12:00:00Z` });
    else if (t.due_on === today) out.push({ id: `task-${t.id}`, level: 'warn', title: `Due today: ${t.title}`, body: lead ? nameOf(lead) : 'Open the lead to finish it.', href, at: `${t.due_on}T12:00:00Z` });
  }
  const rank = { urgent: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.at.localeCompare(a.at));
}

export const actionCount = (alerts: Alert[]) => alerts.filter((a) => a.level !== 'info').length;
