import 'server-only';
import { createHash } from 'node:crypto';
import { env } from './env';

const sha = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

export type CapiEvent = {
  eventName: string;
  eventId: string;
  sourceUrl?: string;
  email?: string;
  phone?: string; // E.164
  firstName?: string;
  lastName?: string;
  externalId?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  customData?: Record<string, unknown>;
};

// Returns true only when Meta accepted the event.
export async function sendCapi(e: CapiEvent): Promise<boolean> {
  const pixel = env.pixelId();
  const token = env.capiToken();
  if (!pixel || !token) return false;
  const user_data: Record<string, unknown> = {};
  if (e.email) user_data.em = [sha(e.email)];
  if (e.phone) user_data.ph = [sha(e.phone.replace(/\D/g, ''))];
  if (e.firstName) user_data.fn = [sha(e.firstName)];
  if (e.lastName) user_data.ln = [sha(e.lastName)];
  if (e.externalId) user_data.external_id = [sha(e.externalId)];
  if (e.ip && e.ip !== 'unknown') user_data.client_ip_address = e.ip;
  if (e.userAgent) user_data.client_user_agent = e.userAgent;
  if (e.fbp) user_data.fbp = e.fbp;
  if (e.fbc) user_data.fbc = e.fbc;
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: 'website',
        event_source_url: e.sourceUrl || env.siteUrl(),
        user_data,
        custom_data: e.customData || {},
      },
    ],
  };
  if (env.capiTestCode()) body.test_event_code = env.capiTestCode();
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('CAPI failed', e.eventName, res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('CAPI error', err);
    return false;
  }
}
