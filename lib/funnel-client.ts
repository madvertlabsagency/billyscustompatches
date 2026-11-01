'use client';
// First party funnel tracker. Events are queued in memory and sent in batches to /api/fe:
// every few seconds, when the queue fills up, and with sendBeacon when the page is hidden.
// Nothing here ever blocks rendering, and every failure is swallowed.
import { deviceFrom, type Device, type FunnelEventName } from './funnel/events';
import { withBase } from './base';

const SID_KEY = 'cpl-fe-sid';
const VID_KEY = 'cpl-fe-vid';
const CTX_KEY = 'cpl-fe-ctx';
const FLUSH_MS = 4000;
const MAX_QUEUE = 20;

type Ctx = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  device: Device;
  referrer?: string;
};
type Queued = { e: FunnelEventName; step?: number; meta?: Record<string, unknown>; t: number };

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let ctxCache: Ctx | null = null;
let furthest = 0;

// Furthest quote step reached in this page visit, reported with page_exit.
export function noteStep(step: number): void {
  furthest = Math.max(furthest, step);
}
export function furthestStep(): number {
  return furthest;
}

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function stored(storage: () => Storage, key: string): string {
  try {
    const s = storage();
    let v = s.getItem(key);
    if (!v) {
      v = rid();
      s.setItem(key, v);
    }
    return v;
  } catch {
    return 'nostore-' + rid();
  }
}

export function sessionId(): string {
  return stored(() => sessionStorage, SID_KEY);
}
export function visitorId(): string {
  return stored(() => localStorage, VID_KEY);
}

// Attribution for this session: taken from the landing URL once, then kept for the session.
// Supports the new ad parameters (campaign_id, adset_id, ad_id) and the older cpl_cid, cpl_asid, cpl_aid.
export function sessionContext(): Ctx {
  if (ctxCache) return ctxCache;
  try {
    const saved = sessionStorage.getItem(CTX_KEY);
    if (saved) return (ctxCache = JSON.parse(saved));
  } catch {
    /* ignore */
  }
  const p = new URLSearchParams(location.search);
  const g = (...names: string[]) => {
    for (const n of names) {
      const v = p.get(n);
      if (v) return v.slice(0, 300);
    }
    return undefined;
  };
  let ref: string | undefined;
  try {
    ref = document.referrer ? new URL(document.referrer).host.slice(0, 200) : undefined;
    if (ref === location.host) ref = undefined;
  } catch {
    ref = undefined;
  }
  const ctx: Ctx = {
    utm_source: g('utm_source'),
    utm_medium: g('utm_medium'),
    utm_campaign: g('utm_campaign'),
    utm_content: g('utm_content'),
    fbclid: g('fbclid'),
    campaign_id: g('campaign_id', 'cpl_cid'),
    adset_id: g('adset_id', 'cpl_asid'),
    ad_id: g('ad_id', 'cpl_aid'),
    device: deviceFrom(navigator.userAgent, window.innerWidth),
    referrer: ref,
  };
  ctxCache = ctx;
  try {
    sessionStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
  return ctx;
}

function payload(events: Queued[]): string {
  return JSON.stringify({ sid: sessionId(), vid: visitorId(), ctx: sessionContext(), sentAt: Date.now(), events });
}

export function flush(useBeacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  const body = payload(batch);
  try {
    if (useBeacon && navigator.sendBeacon && navigator.sendBeacon(withBase('/api/fe'), new Blob([body], { type: 'application/json' }))) return;
    fetch(withBase('/api/fe'), { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
  } catch {
    /* never throw from analytics */
  }
  if (queue.length) flush(useBeacon);
}

// Send whatever is queued when the tab is hidden or closed, even if no component is mounted.
let bound = false;
function bindExit(): void {
  if (bound) return;
  bound = true;
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

export function fe(event: FunnelEventName, step?: number, meta?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  bindExit();
  queue.push({ e: event, ...(step ? { step } : {}), ...(meta ? { meta } : {}), t: Date.now() });
  if (queue.length >= MAX_QUEUE) flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}

// Ids passed with the quote submission so the server logs rfq_submit to the same session.
export function funnelIds(): { funnel_session_id: string; funnel_visitor_id: string; device: Device } {
  return { funnel_session_id: sessionId(), funnel_visitor_id: visitorId(), device: sessionContext().device };
}
