import 'server-only';
import { db } from '../supabase';
import type { Device } from './events';

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|preview|monitor|curl|wget|python|axios/i;
export const isBot = (ua: string | null | undefined) => !ua || BOT_RE.test(ua);

export type EventRow = {
  session_id: string;
  visitor_id: string;
  event: string;
  step: number | null;
  meta: Record<string, unknown>;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  fbclid?: string | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
  device?: Device | null;
  referrer?: string | null;
  created_at?: string;
};

export async function insertEvents(rows: EventRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db().from('funnel_events').insert(rows);
  if (error) console.error('funnel_events insert failed', error.message);
}

// Called by /api/rfq after a quote is saved, so submits are counted even if the browser
// closes immediately. Attribution comes from the tracking object the form sent.
export async function logSubmit(t: Record<string, string | undefined>, info: { rfqId: string; qualified: boolean; grade: string; score: number; patchType: string; quantity: string }): Promise<void> {
  if (!t.funnel_session_id) return;
  const base = {
    session_id: t.funnel_session_id,
    visitor_id: t.funnel_visitor_id || t.funnel_session_id,
    step: null,
    utm_source: t.utm_source || null,
    utm_medium: t.utm_medium || null,
    utm_campaign: t.utm_campaign || null,
    utm_content: t.utm_content || null,
    fbclid: t.fbclid || null,
    campaign_id: t.meta_campaign_id || null,
    adset_id: t.meta_adset_id || null,
    ad_id: t.meta_ad_id || null,
    device: (t.device as Device) || null,
    referrer: null,
  };
  const meta = { rfq_id: info.rfqId, grade: info.grade, score: info.score, patch_type: info.patchType, quantity: info.quantity };
  await insertEvents([
    { ...base, event: 'rfq_submit', meta },
    ...(info.qualified ? [{ ...base, event: 'rfq_qualified', meta }] : []),
  ]);
}
