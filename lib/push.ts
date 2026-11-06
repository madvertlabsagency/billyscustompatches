import 'server-only';
// Phone and desktop notifications for the CRM app (Web Push). A new funnel lead pings everyone in that
// client account who turned notifications on, plus the Madvert Labs admin.
// Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https: contact).
import webpush from 'web-push';
import { db } from './supabase';
import { alertTexts, toLeadAlert, type LeadAlert } from './lead-alert';

export const pushConfigured = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

// title and body are what the phone shows; alert lets an open app play the cha-ching and show its popup.
export type PushMessage = { title: string; body: string; url: string; tag: string; urgent?: boolean; alert?: LeadAlert };

export function leadMessage(alert: LeadAlert): PushMessage {
  return { ...alertTexts(alert), url: alert.url, tag: `lead-${alert.leadId}`, urgent: alert.urgent, alert };
}

async function deliver(subs: Sub[], msg: PushMessage): Promise<number> {
  if (!pushConfigured() || !subs.length) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alerts@madvertlabs.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400, urgency: msg.urgent ? 'high' : 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription (app removed, permission revoked): forget it.
        if (code === 404 || code === 410) await db().from('push_subscriptions').delete().eq('id', s.id);
        else console.error('push failed', code, (e as Error).message);
      }
    }),
  );
  return sent;
}

// Everyone who should hear about this account: its members on any device, and the Madvert Labs admin.
export async function subscribersFor(accountId: string): Promise<Sub[]> {
  const { data: members } = await db().from('account_members').select('member_id').eq('account_id', accountId);
  const ids = ((members || []) as { member_id: string }[]).map((m) => m.member_id);
  const [{ data: owners }, { data: team }] = await Promise.all([
    db().from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('is_owner', true),
    ids.length ? db().from('push_subscriptions').select('id, endpoint, p256dh, auth').in('member_id', ids) : Promise.resolve({ data: [] }),
  ]);
  return [...((owners || []) as Sub[]), ...((team || []) as Sub[])];
}

export async function sendNewLeadPush(leadId: string): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data } = await db().from('quote_requests').select('id, first_name, last_name, quantity, patch_type, lead_grade, lead_score, tags, created_at, account_id, crm_accounts(name, est_rfq_value)').eq('id', leadId).maybeSingle();
  if (!data) return 0;
  type Row = Parameters<typeof toLeadAlert>[0] & { account_id: string; crm_accounts: { name: string; est_rfq_value: number | null } | null };
  const l = data as unknown as Row;
  return deliver(await subscribersFor(l.account_id), leadMessage(toLeadAlert(l, l.crm_accounts || { name: 'your account' })));
}

export async function sendTestPush(subs: Sub[]): Promise<number> {
  // A sample in the same style as a real one, so the team sees exactly what a new RFQ looks like.
  const sample = toLeadAlert({ id: 'sample', first_name: 'Notifications', last_name: 'are on', quantity: 'This is how a new', patch_type: 'RFQ looks', lead_grade: null, lead_score: null, tags: [] }, { name: 'Madvert Labs Patches CRM' });
  return deliver(subs, { ...alertTexts(sample), url: '/patches/notifications', tag: 'test', alert: { ...sample, url: '/patches/notifications' } });
}
