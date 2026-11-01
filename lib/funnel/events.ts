// Shared by the browser tracker, the /api/fe route and the dashboard math. No server imports here.

export const FUNNEL_EVENTS = [
  'page_view',
  'page_load',
  'engaged',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_100',
  'cta_click',
  'patch_type_card_click',
  'rfq_start',
  'rfq_step_view',
  'rfq_step_complete',
  'artwork_upload_success',
  'artwork_upload_fail',
  'validation_error',
  'rfq_submit',
  'rfq_qualified',
  'page_exit',
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

// Events only the server writes (from /api/rfq), never accepted from the browser.
export const SERVER_ONLY_EVENTS: FunnelEventName[] = ['rfq_submit', 'rfq_qualified'];

export type Device = 'mobile' | 'tablet' | 'desktop';

export const STEP_LABELS: Record<number, string> = {
  1: 'Step 1, patch type',
  2: 'Step 2, quantity',
  3: 'Step 3, size',
  4: 'Step 4, backing',
  5: 'Step 5, artwork and email',
  6: 'Step 6, deadline and notes',
  7: 'Step 7, contact details',
};

// One stored row of funnel_events.
export type FunnelEvent = {
  session_id: string;
  visitor_id: string;
  event: string;
  step: number | null;
  meta: Record<string, unknown>;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbclid: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  device: Device | null;
  referrer: string | null;
  created_at: string;
};

export function deviceFrom(userAgent: string, width: number): Device {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android/.test(ua)) return 'mobile';
  if (width > 0 && width < 768) return 'mobile';
  return 'desktop';
}
