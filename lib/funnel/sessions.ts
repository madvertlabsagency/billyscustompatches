// Turns raw funnel_events rows into one record per session. Pure functions, unit tested.
import type { Device, FunnelEvent } from './events';

export type Session = {
  id: string;
  visitorId: string;
  start: number;
  last: number;
  device: Device | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  pageView: boolean;
  // engagement signals
  engagedAction: boolean; // scrolled past 50%, clicked, or used the form
  seconds: number; // best known time on page
  // quote form
  sawForm: boolean;
  started: boolean;
  furthestStep: number; // 0 when never started
  stepMs: Partial<Record<number, number>>; // time spent before completing each step
  validationErrors: { step: number; field: string }[];
  uploadsOk: string[]; // file extensions
  uploadsFailed: string[];
  submitted: boolean;
  qualified: boolean;
  patchType: string | null;
  quantity: string | null;
  ctas: string[];
  // page speed (ms)
  lcp: number | null;
  fcp: number | null;
  ttfb: number | null;
};

const ACTION_EVENTS = new Set(['cta_click', 'patch_type_card_click', 'rfq_start', 'rfq_step_complete', 'artwork_upload_success', 'artwork_upload_fail', 'validation_error', 'rfq_submit']);

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function buildSessions(events: FunnelEvent[]): Session[] {
  const map = new Map<string, Session>();
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of sorted) {
    const t = Date.parse(e.created_at);
    let x = map.get(e.session_id);
    if (!x) {
      x = {
        id: e.session_id,
        visitorId: e.visitor_id,
        start: t,
        last: t,
        device: e.device,
        campaignId: e.campaign_id,
        adsetId: e.adset_id,
        adId: e.ad_id,
        utmSource: e.utm_source,
        utmCampaign: e.utm_campaign,
        utmContent: e.utm_content,
        referrer: e.referrer,
        pageView: false,
        engagedAction: false,
        seconds: 0,
        sawForm: false,
        started: false,
        furthestStep: 0,
        stepMs: {},
        validationErrors: [],
        uploadsOk: [],
        uploadsFailed: [],
        submitted: false,
        qualified: false,
        patchType: null,
        quantity: null,
        ctas: [],
        lcp: null,
        fcp: null,
        ttfb: null,
      };
      map.set(e.session_id, x);
    }
    x.last = Math.max(x.last, t);
    x.device ??= e.device;
    x.campaignId ??= e.campaign_id;
    x.adsetId ??= e.adset_id;
    x.adId ??= e.ad_id;
    x.utmSource ??= e.utm_source;
    x.utmCampaign ??= e.utm_campaign;
    x.utmContent ??= e.utm_content;
    const m = e.meta || {};
    if (ACTION_EVENTS.has(e.event)) x.engagedAction = true;

    switch (e.event) {
      case 'page_view':
        x.pageView = true;
        break;
      case 'engaged':
        if (m.reason === 'scroll' || m.reason === 'click') x.engagedAction = true;
        x.seconds = Math.max(x.seconds, n(m.seconds) ?? 0);
        break;
      case 'page_exit':
        x.seconds = Math.max(x.seconds, n(m.seconds) ?? 0);
        if (m.clicked === true || (n(m.max_scroll) ?? 0) >= 50) x.engagedAction = true;
        break;
      case 'page_load':
        x.lcp = n(m.lcp) ?? x.lcp;
        x.fcp = n(m.fcp) ?? x.fcp;
        x.ttfb = n(m.ttfb) ?? x.ttfb;
        break;
      case 'cta_click':
        if (s(m.cta)) x.ctas.push(m.cta as string);
        break;
      case 'patch_type_card_click':
        x.patchType = s(m.patch_type) ?? x.patchType;
        break;
      case 'rfq_start':
        x.started = true;
        x.furthestStep = Math.max(x.furthestStep, 1);
        break;
      case 'rfq_step_view':
        if (e.step === 1) x.sawForm = true;
        if (e.step && e.step > 1) {
          x.started = true;
          x.furthestStep = Math.max(x.furthestStep, e.step);
        }
        break;
      case 'rfq_step_complete':
        if (e.step) {
          x.started = true;
          x.furthestStep = Math.max(x.furthestStep, Math.min(7, e.step + 1), e.step);
          const ms = n(m.ms);
          if (ms !== null && ms >= 0 && ms < 3_600_000) x.stepMs[e.step] = ms;
          if (e.step === 1) x.patchType = s(m.patch_type) ?? x.patchType;
          if (e.step === 2) x.quantity = s(m.quantity) ?? x.quantity;
        }
        break;
      case 'validation_error':
        if (e.step) x.validationErrors.push({ step: e.step, field: s(m.field) ?? 'unknown' });
        break;
      case 'artwork_upload_success':
        x.uploadsOk.push(s(m.ext) ?? 'unknown');
        break;
      case 'artwork_upload_fail':
        x.uploadsFailed.push(s(m.ext) ?? 'unknown');
        break;
      case 'rfq_submit':
        x.submitted = true;
        x.started = true;
        x.furthestStep = 7;
        x.patchType = s(m.patch_type) ?? x.patchType;
        x.quantity = s(m.quantity) ?? x.quantity;
        break;
      case 'rfq_qualified':
        x.qualified = true;
        break;
    }
  }
  for (const x of map.values()) {
    x.seconds = Math.max(x.seconds, Math.round((x.last - x.start) / 1000));
    if (x.sawForm === false && x.started) x.sawForm = true;
  }
  return [...map.values()];
}

// Engaged: any click or form action, a scroll past 50%, or at least `engagedSeconds` on the page.
export function isEngaged(x: Session, engagedSeconds: number): boolean {
  return x.engagedAction || x.seconds >= engagedSeconds;
}

// Bounce: a session with a page view and no engagement.
export function isBounce(x: Session, engagedSeconds: number): boolean {
  return x.pageView && !isEngaged(x, engagedSeconds);
}

export function bounceRate(sessions: Session[], engagedSeconds: number): number | null {
  const views = sessions.filter((x) => x.pageView);
  if (!views.length) return null;
  return (views.filter((x) => isBounce(x, engagedSeconds)).length / views.length) * 100;
}
