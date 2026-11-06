import 'server-only';
// Phone and desktop notifications for the CRM app (Web Push). A new funnel lead pings everyone in that
// client account who turned notifications on, plus the Madvert Labs admin.
// Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https: contact).
import webpush from 'web-push';
import { db } from './supabase';

export const pushConfigured = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string; tag: string; urgent?: boolean };

export function leadMessage(l: { id: string; first_name: string; last_name: string; quantity: string; patch_type: string; lead_grade: string | null; lead_score: number | null; tags: string[] | null }, accountName: string): PushMessage {
  const rush = (l.tags || []).includes('RUSH ORDER');
  const urgent = rush || l.lead_grade === 'Very high';
  const grade = l.lead_grade ? `${urgent ? 'URGENT, ' : ''}${l.lead_grade} lead${l.lead_score !== null ? ` (score ${l.lead_score})` : ''}` : 'New lead';
  return {
    title: `New RFQ lead received, ${accountName}`,
    body: `${`${l.first_name} ${l.last_name}`.trim()}: ${l.quantity} ${l.patch_type}\n${grade}${rush ? ', rush order' : ''}`,
    url: `/admin/lead/${l.id}`,
    tag: `lead-${l.id}`,
    urgent,
  };
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
  const { data } = await db().from('quote_requests').select('id, first_name, last_name, quantity, patch_type, lead_grade, lead_score, tags, account_id, crm_accounts(name)').eq('id', leadId).maybeSingle();
  if (!data) return 0;
  const l = data as unknown as Parameters<typeof leadMessage>[0] & { account_id: string; crm_accounts: { name: string } | null };
  return deliver(await subscribersFor(l.account_id), leadMessage(l, l.crm_accounts?.name || 'your account'));
}

export async function sendTestPush(subs: Sub[]): Promise<number> {
  return deliver(subs, { title: 'Notifications are on', body: 'You will get a ping here when a new RFQ lead arrives.', url: '/admin/notifications', tag: 'test' });
}
