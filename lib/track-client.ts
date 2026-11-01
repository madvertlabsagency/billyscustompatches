'use client';
import { withBase } from './base';
// Browser side of Meta tracking. Every event goes to the Pixel and to /api/track (CAPI)
// with the same event_id so Meta deduplicates them.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const STANDARD = new Set(['PageView', 'ViewContent', 'Lead']);
const ATTR_KEY = 'cpl-attr';

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function cookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function track(eventName: string, data: Record<string, string | number> = {}, eventId = uuid(), mirror = true): string {
  try {
    if (window.fbq) window.fbq(STANDARD.has(eventName) ? 'track' : 'trackCustom', eventName, data, { eventID: eventId });
  } catch {
    /* pixel blocked */
  }
  if (mirror) {
    const payload = JSON.stringify({ eventName, eventId, url: location.href, fbp: cookie('_fbp'), fbc: cookie('_fbc'), customData: data });
    if (navigator.sendBeacon) navigator.sendBeacon(withBase('/api/track'), new Blob([payload], { type: 'application/json' }));
    else fetch(withBase('/api/track'), { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
  }
  return eventId;
}

export type Attribution = Record<string, string>;

// Saves UTM parameters, fbclid and Meta ad IDs from the landing URL so they survive the whole funnel.
export function captureAttribution(): void {
  try {
    const p = new URLSearchParams(location.search);
    const map: Record<string, string> = {
      utm_source: 'utm_source',
      utm_medium: 'utm_medium',
      utm_campaign: 'utm_campaign',
      utm_content: 'utm_content',
      utm_term: 'utm_term',
      fbclid: 'fbclid',
      cpl_cid: 'meta_campaign_id',
      cpl_asid: 'meta_adset_id',
      cpl_aid: 'meta_ad_id',
      // current ad URL parameters (see docs/FUNNEL-ANALYTICS.md); they win over the older cpl_ names
      campaign_id: 'meta_campaign_id',
      adset_id: 'meta_adset_id',
      ad_id: 'meta_ad_id',
    };
    const found: Attribution = {};
    for (const [param, key] of Object.entries(map)) {
      const v = p.get(param);
      if (v) found[key] = v.slice(0, 500);
    }
    const prev: Attribution = JSON.parse(localStorage.getItem(ATTR_KEY) || '{}');
    if (Object.keys(found).length) {
      localStorage.setItem(ATTR_KEY, JSON.stringify({ ...found, landing_page: location.href.slice(0, 1000) }));
    } else if (!prev.landing_page) {
      localStorage.setItem(ATTR_KEY, JSON.stringify({ landing_page: location.href.slice(0, 1000) }));
    }
    if (found.fbclid && !cookie('_fbc')) {
      document.cookie = `_fbc=fb.1.${Date.now()}.${found.fbclid}; path=/; max-age=7776000; SameSite=Lax`;
    }
  } catch {
    /* storage blocked */
  }
}

export function getAttribution(): Attribution {
  try {
    const a: Attribution = JSON.parse(localStorage.getItem(ATTR_KEY) || '{}');
    const fbp = cookie('_fbp');
    const fbc = cookie('_fbc');
    return { ...a, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
  } catch {
    return {};
  }
}
