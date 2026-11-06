import 'server-only';
import { db } from './supabase';
import { loadTasks, todayNY } from './crm';
import { computeAlerts, type Alert, type AlertLead } from './crm-alerts';

// Alerts for one client account: recent and open leads, when the team last touched each, and open tasks.
export async function loadAlerts(accountId: string): Promise<Alert[]> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data }, tasks] = await Promise.all([
    db()
      .from('quote_requests')
      .select('id, first_name, last_name, quantity, patch_type, created_at, lead_status, assignee_id, lead_grade, lead_score, tags')
      .eq('account_id', accountId)
      .or(`lead_status.in.(new,contacted,quoted),created_at.gte.${since}`)
      .order('created_at', { ascending: false })
      .limit(500),
    loadTasks({ accountId, open: true }),
  ]);
  const leads = (data || []) as AlertLead[];
  const lastTouch = new Map<string, string>();
  if (leads.length) {
    const { data: acts } = await db()
      .from('lead_activity')
      .select('lead_id, created_at')
      .in('lead_id', leads.map((l) => l.id))
      .order('created_at', { ascending: false })
      .limit(5000);
    for (const a of (acts || []) as { lead_id: string; created_at: string }[]) if (!lastTouch.has(a.lead_id)) lastTouch.set(a.lead_id, a.created_at);
  }
  return computeAlerts({ leads, lastTouch, tasks, now: Date.now(), today: todayNY() });
}
