// DEMO mode: generated, clearly fake traffic so the dashboard layout can be checked before real
// ads run. Deterministic for a given range, so numbers do not jump on every refresh.
import type { Device, FunnelEvent } from './events';
import type { MetaAdRow, MetaData } from './meta-types';
import type { Range } from './range';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AdDef = { campaign_id: string; campaign_name: string; adset_id: string; adset_name: string; ad_id: string; ad_name: string; daily: number; ctr: number; lpv: number; perf: number };

export const DEMO_ADS: AdDef[] = [
  { campaign_id: '120200001', campaign_name: 'Leadlink | Custom Patches | Broad US', adset_id: '120210001', adset_name: 'US 25 to 55, broad', ad_id: '120220001', ad_name: 'Hook: $0 setup video', daily: 32, ctr: 0.019, lpv: 0.84, perf: 1.35 },
  { campaign_id: '120200001', campaign_name: 'Leadlink | Custom Patches | Broad US', adset_id: '120210001', adset_name: 'US 25 to 55, broad', ad_id: '120220002', ad_name: 'Flat lay carousel', daily: 22, ctr: 0.014, lpv: 0.8, perf: 1 },
  { campaign_id: '120200001', campaign_name: 'Leadlink | Custom Patches | Broad US', adset_id: '120210002', adset_name: 'Lookalike of past RFQs', ad_id: '120220003', ad_name: 'Heat press reel', daily: 18, ctr: 0.012, lpv: 0.78, perf: 0.95 },
  { campaign_id: '120200001', campaign_name: 'Leadlink | Custom Patches | Broad US', adset_id: '120210002', adset_name: 'Lookalike of past RFQs', ad_id: '120220004', ad_name: 'UGC jacket review', daily: 20, ctr: 0.007, lpv: 0.62, perf: 0.35 },
  { campaign_id: '120200002', campaign_name: 'Leadlink | Retarget visitors', adset_id: '120210003', adset_name: 'Site visitors 30 days', ad_id: '120220005', ad_name: 'Customer review card', daily: 8, ctr: 0.024, lpv: 0.86, perf: 1.25 },
];

const TYPES = ['Embroidered', 'Embroidered', 'Embroidered', 'PVC', 'Chenille', 'Woven', 'Sublimation', 'Not sure'];
const QTYS = ['10 to 24', '25 to 49', '50 to 99', '50 to 99', '100 to 249', '100 to 249', '250 to 499', '500 to 999', '1,000+', 'Not sure yet'];
const HOUR_WEIGHT = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 1.6, 2, 2.2, 2.3, 2.4, 2.6, 2.5, 2.4, 2.4, 2.6, 2.9, 3.3, 3.6, 3.7, 3.3, 2.5, 1.6];

export function demoData(range: Range, previous: boolean, now: number): { events: FunnelEvent[]; meta: MetaData } {
  const r = rng(Math.floor(range.start / 3_600_000) + (previous ? 7 : 1));
  const days = Math.max(0.05, (range.end - range.start) / 86_400_000);
  const events: FunnelEvent[] = [];
  const ads: MetaAdRow[] = [];
  // the previous period is a little weaker on step 3 and cheaper, so comparisons have something to show
  const stepGo = previous ? [0.9, 0.87, 0.62, 0.86, 0.58, 0.9, 0.74] : [0.9, 0.88, 0.8, 0.86, 0.58, 0.9, 0.75];
  const cpm = previous ? 12.4 : 14.6;

  const randTime = () => {
    for (let i = 0; i < 50; i++) {
      const t = range.start + r() * (range.end - range.start);
      if (r() * 3.7 < HOUR_WEIGHT[new Date(t).getUTCHours() % 24]) return t;
    }
    return range.start + r() * (range.end - range.start);
  };
  const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  let sid = 0;

  const session = (ad: AdDef | null, perf: number) => {
    sid++;
    const id = `demo-${previous ? 'p' : 'c'}-${range.start}-${sid}`;
    const device: Device = r() < 0.74 ? 'mobile' : r() < 0.8 ? 'desktop' : 'tablet';
    let t = randTime();
    const base = {
      session_id: id,
      visitor_id: `v-${id}`,
      utm_source: ad ? 'facebook' : null,
      utm_medium: ad ? 'paid' : null,
      utm_campaign: ad?.campaign_name ?? null,
      utm_content: ad?.ad_name ?? null,
      fbclid: ad ? `fb.${sid}` : null,
      campaign_id: ad?.campaign_id ?? null,
      adset_id: ad?.adset_id ?? null,
      ad_id: ad?.ad_id ?? null,
      device,
      referrer: ad ? 'm.facebook.com' : r() < 0.5 ? 'www.google.com' : null,
    };
    const push = (event: string, step: number | null = null, meta: Record<string, unknown> = {}, dt = 1000) => {
      t += dt;
      if (t > now) return;
      events.push({ ...base, event, step, meta, created_at: new Date(t).toISOString() });
    };
    const mobile = device !== 'desktop';
    const lcp = Math.round((mobile ? 2100 : 1250) * Math.exp((r() - 0.35) * 1.1));
    push('page_view', null, { path: '/' }, 0);
    push('page_load', null, { lcp, fcp: Math.round(lcp * 0.55), ttfb: Math.round(120 + r() * 380) }, 1500);
    const bounce = r() < (mobile ? 0.44 : 0.36) / Math.min(perf, 1.3);
    if (bounce) {
      push('page_exit', null, { seconds: Math.round(2 + r() * 7), max_scroll: Math.round(r() * 30), clicked: false, last_step: 0 }, 4000);
      return;
    }
    push('engaged', null, { reason: r() < 0.6 ? 'scroll' : 'time', seconds: 8 }, 6000);
    push('scroll_25', null, {}, 3000);
    push('scroll_50', null, {}, 5000);
    if (r() < 0.6) push('scroll_75', null, {}, 6000);
    const sawForm = r() < 0.75;
    if (!sawForm) {
      push('page_exit', null, { seconds: Math.round(20 + r() * 60), max_scroll: 60, clicked: false, last_step: 0 }, 15000);
      return;
    }
    if (r() < 0.5) push('cta_click', null, { cta: pick(['hero_quote', 'mobile_sticky', 'header_quote', 'reel_mockup']) }, 2000);
    push('rfq_step_view', 1, {}, 2000);
    if (r() > Math.min(0.62, 0.42 * perf)) {
      push('page_exit', 1, { seconds: Math.round(30 + r() * 60), max_scroll: 70, clicked: true, last_step: 1 }, 20000);
      return;
    }
    const type = pick(TYPES);
    const qty = pick(QTYS);
    push('rfq_start', null, {}, 3000);
    for (let step = 1; step <= 7; step++) {
      const ms = Math.round([6, 5, 14, 7, 38, 12, 41][step - 1] * 1000 * (0.5 + r()));
      if (step === 3 && r() < 0.25) push('validation_error', 3, { field: 'w' }, 4000);
      if (step === 5) {
        if (r() < 0.68) {
          const ext = pick(['png', 'png', 'jpg', 'jpg', 'pdf', 'ai', 'svg']);
          const fail = r() < (ext === 'ai' ? 0.35 : 0.04);
          push(fail ? 'artwork_upload_fail' : 'artwork_upload_success', 5, { ext, size: 400000 }, 8000);
          if (fail && r() < 0.5) push('validation_error', 5, { field: 'files' }, 3000);
        } else if (r() < 0.3) push('validation_error', 5, { field: 'files' }, 4000);
      }
      if (step === 7 && r() < 0.3) push('validation_error', 7, { field: pick(['phone', 'phone', 'consent', 'email']) }, 5000);
      const go = Math.min(0.97, stepGo[step - 1] * (0.88 + 0.12 * Math.min(perf, 1.4)));
      if (r() > go) {
        push('page_exit', step, { seconds: Math.round(60 + r() * 120), max_scroll: 80, clicked: true, last_step: step }, ms);
        return;
      }
      push('rfq_step_complete', step, { ms, ...(step === 1 ? { patch_type: type } : step === 2 ? { quantity: qty } : {}) }, ms);
      if (step < 7) push('rfq_step_view', step + 1, {}, 300);
    }
    const qualified = ['250 to 499', '500 to 999', '1,000+', '100 to 249'].includes(qty) && r() < 0.75;
    push('rfq_submit', null, { patch_type: type, quantity: qty, grade: qualified ? 'High' : 'Medium' }, 1500);
    if (qualified) push('rfq_qualified', null, { patch_type: type, quantity: qty, grade: 'High' }, 0);
    push('page_exit', 7, { seconds: Math.round(150 + r() * 120), max_scroll: 90, clicked: true, last_step: 7 }, 3000);
  };

  for (const ad of DEMO_ADS) {
    const spend = +(ad.daily * days * (0.85 + r() * 0.3)).toFixed(2);
    const impressions = Math.round((spend / cpm) * 1000);
    const clicks = Math.round(impressions * ad.ctr * (0.9 + r() * 0.2));
    const lpv = Math.round(clicks * ad.lpv);
    const reach = Math.round(impressions / (previous ? 2.2 : 2.8));
    const before = events.length;
    const n = Math.round(lpv * 0.93);
    for (let k = 0; k < n; k++) session(ad, ad.perf);
    const submits = events.slice(before).filter((e) => e.event === 'rfq_submit').length;
    ads.push({
      campaign_id: ad.campaign_id,
      campaign_name: ad.campaign_name,
      adset_id: ad.adset_id,
      adset_name: ad.adset_name,
      ad_id: ad.ad_id,
      ad_name: ad.ad_name,
      spend,
      impressions,
      reach,
      frequency: reach ? impressions / reach : 0,
      link_clicks: clicks,
      landing_page_views: lpv,
      leads: Math.round(submits * 0.9),
    });
  }
  // a little organic and direct traffic, only visible with "All traffic"
  const organic = Math.round(days * 6);
  for (let k = 0; k < organic; k++) session(null, 0.9);

  const totImp = ads.reduce((t, a) => t + a.impressions, 0);
  const totReach = Math.round(totImp / (previous ? 2.1 : 2.75));
  return {
    events,
    meta: {
      configured: true,
      ads,
      totals: { spend: ads.reduce((t, a) => t + a.spend, 0), impressions: totImp, reach: totReach, frequency: totReach ? totImp / totReach : 0 },
      fetchedAt: new Date(now).toISOString(),
    },
  };
}
