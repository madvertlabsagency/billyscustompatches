import { describe, expect, it } from 'vitest';
import type { FunnelEvent } from '@/lib/funnel/events';
import { bounceRate, buildSessions, isBounce, isEngaged, type Session } from '@/lib/funnel/sessions';
import { buildStages, countSessions, keyRates, percentile, rateStatus, stepRows, sumMeta, type AdRow, type Counts, type MetaSums, type StepRow } from '@/lib/funnel/metrics';
import { RULES, STEP_ADVICE, runInsights, type InsightContext } from '@/lib/funnel/insights';
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/funnel/settings';
import { previousRange, resolveRange, midnight } from '@/lib/funnel/range';
import { buildReport, filterSessions } from '@/lib/funnel/report';
import { demoData } from '@/lib/funnel/demo';
import type { MetaAdRow } from '@/lib/funnel/meta-types';
import { parseInsightRow } from '@/lib/funnel/meta-types';

const T0 = Date.parse('2026-10-10T15:00:00Z');
let seq = 0;
function ev(session: string, event: string, secs: number, step: number | null = null, meta: Record<string, unknown> = {}, extra: Partial<FunnelEvent> = {}): FunnelEvent {
  seq++;
  return {
    session_id: session, visitor_id: 'v-' + session, event, step, meta,
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, fbclid: null,
    campaign_id: null, adset_id: null, ad_id: null, device: 'mobile', referrer: null,
    created_at: new Date(T0 + secs * 1000 + seq).toISOString(), ...extra,
  };
}

const S = { ...DEFAULT_SETTINGS };

// ---------- bounce ----------
describe('bounce', () => {
  it('a page view with nothing else is a bounce', () => {
    const [x] = buildSessions([ev('a', 'page_view', 0)]);
    expect(isBounce(x, 10)).toBe(true);
  });
  it('time on page from page_exit decides engagement against the threshold', () => {
    const [x] = buildSessions([ev('a', 'page_view', 0), ev('a', 'page_exit', 1, null, { seconds: 12, max_scroll: 10, clicked: false })]);
    expect(isBounce(x, 10)).toBe(false);
    expect(isBounce(x, 15)).toBe(true); // configurable threshold
  });
  it('a scroll past 50% or a click is engaged no matter the time', () => {
    const [x] = buildSessions([ev('a', 'page_view', 0), ev('a', 'engaged', 2, null, { reason: 'scroll', seconds: 2 })]);
    expect(isEngaged(x, 60)).toBe(true);
    const [y] = buildSessions([ev('b', 'page_view', 0), ev('b', 'cta_click', 1, null, { cta: 'hero_quote' })]);
    expect(isBounce(y, 60)).toBe(false);
  });
  it('a time based engaged event only counts when it meets the threshold', () => {
    const [x] = buildSessions([ev('a', 'page_view', 0), ev('a', 'engaged', 0, null, { reason: 'time', seconds: 10 })]);
    expect(isEngaged(x, 10)).toBe(true);
    expect(isEngaged(x, 20)).toBe(false);
  });
  it('falls back to the gap between first and last event when page_exit is missing', () => {
    const [x] = buildSessions([ev('a', 'page_view', 0), ev('a', 'scroll_25', 30)]);
    expect(x.seconds).toBeGreaterThanOrEqual(30);
    expect(isBounce(x, 10)).toBe(false);
  });
  it('bounce rate only counts sessions with a page view', () => {
    const sessions = buildSessions([
      ev('a', 'page_view', 0),
      ev('b', 'page_view', 0), ev('b', 'cta_click', 3, null, { cta: 'x' }),
      ev('c', 'rfq_submit', 0),
    ]);
    expect(bounceRate(sessions, 10)).toBe(50);
    expect(bounceRate([], 10)).toBeNull();
  });
});

// ---------- sessions and funnel math ----------
function journey(id: string, lastStep: number, submitted = false, qualified = false): FunnelEvent[] {
  const out = [ev(id, 'page_view', 0), ev(id, 'rfq_step_view', 2, 1), ev(id, 'rfq_start', 3)];
  for (let s = 1; s < lastStep; s++) {
    out.push(ev(id, 'rfq_step_complete', 4 + s * 10, s, { ms: s * 1000, ...(s === 1 ? { patch_type: 'PVC' } : s === 2 ? { quantity: '100 to 249' } : {}) }));
    out.push(ev(id, 'rfq_step_view', 5 + s * 10, s + 1));
  }
  if (submitted) out.push(ev(id, 'rfq_step_complete', 100, 7, { ms: 7000 }), ev(id, 'rfq_submit', 101, null, { patch_type: 'PVC', quantity: '100 to 249' }));
  if (qualified) out.push(ev(id, 'rfq_qualified', 101));
  return out;
}

describe('funnel math', () => {
  const events = [
    ...journey('s1', 7, true, true),
    ...journey('s2', 7, true),
    ...journey('s3', 5),
    ...journey('s4', 2),
    ev('s5', 'page_view', 0), ev('s5', 'rfq_step_view', 2, 1),
    ev('s6', 'page_view', 0),
  ];
  const sessions = buildSessions(events);
  const c = countSessions(sessions, 10);

  it('builds furthest step, answers and step times', () => {
    const s3 = sessions.find((x) => x.id === 's3')!;
    expect(s3.furthestStep).toBe(5);
    expect(s3.patchType).toBe('PVC');
    expect(s3.quantity).toBe('100 to 249');
    expect(s3.stepMs[2]).toBe(2000);
    expect(sessions.find((x) => x.id === 's5')!.started).toBe(false);
    expect(sessions.find((x) => x.id === 's5')!.sawForm).toBe(true);
  });

  it('counts each stage once per session and keeps steps monotonic', () => {
    expect(c.sessions).toBe(6);
    expect(c.sawForm).toBe(5);
    expect(c.started).toBe(4);
    expect(c.reached.slice(1)).toEqual([4, 4, 3, 3, 3, 2, 2]);
    expect(c.submitted).toBe(2);
    expect(c.qualified).toBe(1);
  });

  it('computes conversion from the previous stage and cost per stage', () => {
    const meta: MetaSums = { spend: 100, impressions: 10000, linkClicks: 200, lpv: 160, leads: 2, reach: 4000, frequency: 2.5 };
    const st = buildStages(c, meta);
    const by = (k: string) => st.find((x) => x.key === k)!;
    expect(by('link_clicks').fromPrev).toBeCloseTo(2);
    expect(by('lpv').fromPrev).toBeCloseTo(80);
    expect(by('impressions').costPer).toBeCloseTo(10); // CPM
    expect(by('submitted').costPer).toBeCloseTo(50);
    expect(by('qualified').fromPrev).toBeCloseTo(50);
    expect(buildStages(c, null).find((x) => x.key === 'impressions')).toBeUndefined();
  });

  it('step rows report loss, median time and validation errors', () => {
    const withErr = buildSessions([...events, ev('s4', 'validation_error', 50, 2, { field: 'qty' }), ev('s4', 'validation_error', 51, 2, { field: 'qty' })]);
    const rows = stepRows(withErr, countSessions(withErr, 10));
    expect(rows[1].lostPct).toBeCloseTo(25); // step 2: 4 reached, 3 went on
    expect(rows[1].errors[0]).toMatchObject({ field: 'qty', count: 2 });
    expect(rows[6].next).toBe(2); // step 7 goes on to submitted
    expect(rows[0].medianSec).toBeCloseTo(1);
  });

  it('percentile, status and Meta sums', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([], 75)).toBeNull();
    expect(rateStatus(2, 1.5, 0.8)).toBe('good');
    expect(rateStatus(1, 1.5, 0.8)).toBe('warning');
    expect(rateStatus(0.5, 1.5, 0.8)).toBe('critical');
    expect(rateStatus(40, 45, 65)).toBe('good'); // lower is better
    expect(rateStatus(70, 45, 65)).toBe('critical');
    const row = (over: Partial<MetaAdRow>): MetaAdRow => ({ campaign_id: 'c', campaign_name: 'Leadlink', adset_id: 's', adset_name: '', ad_id: 'a', ad_name: '', spend: 10, impressions: 1000, reach: 500, frequency: 2, link_clicks: 10, landing_page_views: 8, leads: 1, ...over });
    const sums = sumMeta([row({}), row({ ad_id: 'b', reach: 700 })], null);
    expect(sums.spend).toBe(20);
    expect(sums.reach).toBe(700);
    expect(sumMeta([row({})], { spend: 10, impressions: 1000, reach: 400, frequency: 2.5 }).frequency).toBe(2.5);
  });

  it('key rates compare with the previous period and hide status on low samples', () => {
    const cur = { counts: { ...c, sessions: 100, started: 40, submitted: 20 }, meta: { spend: 200, impressions: 20000, linkClicks: 300, lpv: 250, leads: 10, reach: 8000, frequency: 2.5 }, bounce: 40 };
    const prev = { counts: { ...c, sessions: 100, started: 40, submitted: 10 }, meta: null, bounce: 50 };
    const rates = keyRates(cur, prev, S);
    const r = (k: string) => rates.find((x) => x.key === k)!;
    expect(r('ctr').value).toBeCloseTo(1.5);
    expect(r('ctr').status).toBe('good');
    expect(r('startToSubmit').value).toBe(50);
    expect(r('startToSubmit').change).toBeCloseTo(100);
    expect(r('bounce').better).toBe('lower');
    expect(r('costPerRfq').value).toBe(10);
    const low = keyRates({ ...cur, counts: { ...cur.counts, sessions: 3 } }, prev, S);
    expect(low.find((x) => x.key === 'bounce')!.status).toBe('none');
    expect(low.find((x) => x.key === 'bounce')!.lowSample).toBe(true);
  });

  it('parses Graph API insight rows', () => {
    const r = parseInsightRow({ ad_id: '1', spend: '12.5', impressions: '1000', inline_link_clicks: '20', actions: [{ action_type: 'landing_page_view', value: '15' }, { action_type: 'offsite_conversion.fb_pixel_lead', value: '2' }] });
    expect(r).toMatchObject({ spend: 12.5, impressions: 1000, link_clicks: 20, landing_page_views: 15, leads: 2 });
  });

  it('Leadlink filter keeps only sessions from those campaigns', () => {
    const paid = buildSessions([
      ev('p1', 'page_view', 0, null, {}, { campaign_id: 'c1' }),
      ev('p2', 'page_view', 0, null, {}, { utm_campaign: 'Leadlink | Retarget' }),
      ev('o1', 'page_view', 0),
    ]);
    const ads = [{ campaign_id: 'c1', campaign_name: 'Leadlink A' } as MetaAdRow];
    const f = { campaign: null, adset: null, ad: null, all: false };
    expect(filterSessions(paid, f, ads, 'Leadlink').map((x) => x.id).sort()).toEqual(['p1', 'p2']);
    expect(filterSessions(paid, { ...f, all: true }, ads, 'Leadlink')).toHaveLength(3);
    expect(filterSessions(paid, { ...f, campaign: 'c1' }, ads, 'Leadlink').map((x) => x.id)).toEqual(['p1']);
  });
});

describe('settings and ranges', () => {
  it('merges saved settings and ignores bad values', () => {
    const m = mergeSettings({ ctrGood: '2', bouncePoor: 'abc', extra: 5, minSessions: -1 });
    expect(m.ctrGood).toBe(2);
    expect(m.bouncePoor).toBe(DEFAULT_SETTINGS.bouncePoor);
    expect(m.minSessions).toBe(DEFAULT_SETTINGS.minSessions);
  });
  it('resolves ranges in the business time zone with an equal previous period', () => {
    const now = Date.parse('2026-10-11T18:00:00Z'); // 2 pm in New York
    const tz = 'America/New_York';
    const r = resolveRange('last_7d', tz, now);
    expect(r).toMatchObject({ since: '2026-10-05', until: '2026-10-11' });
    expect(r.start).toBe(midnight('2026-10-05', tz));
    expect(new Date(r.start).toISOString()).toBe('2026-10-05T04:00:00.000Z');
    const p = previousRange(r, tz);
    expect(p).toMatchObject({ since: '2026-09-28', until: '2026-10-04' });
    const today = resolveRange('today', tz, now);
    const y = previousRange(today, tz);
    expect(y.since).toBe('2026-10-10');
    expect(y.end - y.start).toBe(today.end - today.start);
    expect(resolveRange('custom', tz, now, '2026-10-09', '2026-10-01')).toMatchObject({ since: '2026-10-01', until: '2026-10-09' });
  });
});

// ---------- insight rules ----------
function counts(over: Partial<Counts> = {}): Counts {
  return { sessions: 0, engaged: 0, bounced: 0, sawForm: 0, started: 0, reached: [0, 0, 0, 0, 0, 0, 0, 0], submitted: 0, qualified: 0, ...over };
}
function steps(reached: number[], submitted: number, errors: StepRow['errors'] = []): StepRow[] {
  return reached.map((r, i) => {
    const next = i < 6 ? reached[i + 1] : submitted;
    return { step: i + 1, label: `Step ${i + 1}, x`, reached: r, next, lostPct: r ? (1 - next / r) * 100 : null, medianSec: 10, errors: i === 4 ? errors : [] };
  });
}
function ad(over: Partial<AdRow>): AdRow {
  return { adId: 'a', name: 'Ad', campaign: '', adset: '', spend: 0, impressions: 0, linkClicks: 0, ctr: null, lpv: 0, frequency: 0, sessions: 0, started: 0, submitted: 0, qualified: 0, costPerRfq: null, costPerQualified: null, conv: null, ...over };
}
const meta = (over: Partial<MetaSums> = {}): MetaSums => ({ spend: 100, impressions: 10000, linkClicks: 200, lpv: 170, leads: 5, reach: 5000, frequency: 2, ...over });
function ctx(over: Partial<InsightContext> = {}): InsightContext {
  return {
    s: { ...S }, meta: meta(), prevMeta: meta(), counts: counts(), prevCounts: counts(), bounce: null, prevBounce: null,
    steps: steps([0, 0, 0, 0, 0, 0, 0], 0), prevSteps: steps([0, 0, 0, 0, 0, 0, 0], 0), speed: [], ads: [], uploads: { ok: [], failed: [] }, ...over,
  };
}
const rule = (id: string) => RULES.find((r) => r.id === id)!;
const fired = (out: ReturnType<(typeof RULES)[number]['run']>) => (Array.isArray(out) ? out : []);
const pending = (out: ReturnType<(typeof RULES)[number]['run']>) => !Array.isArray(out);

describe('insight rules', () => {
  it('ctr_low fires below the benchmark, needs impressions and Meta data', () => {
    expect(fired(rule('ctr_low').run(ctx({ meta: meta({ linkClicks: 60, impressions: 10000 }) })))[0].severity).toBe('critical'); // 0.6%
    expect(fired(rule('ctr_low').run(ctx({ meta: meta({ linkClicks: 100, impressions: 10000 }) })))[0].severity).toBe('warning'); // 1.0%
    expect(fired(rule('ctr_low').run(ctx({ meta: meta({ linkClicks: 200, impressions: 10000 }) })))).toHaveLength(0);
    expect(pending(rule('ctr_low').run(ctx({ meta: meta({ impressions: 50, linkClicks: 0 }) })))).toBe(true);
    expect(pending(rule('ctr_low').run(ctx({ meta: null })))).toBe(true);
  });

  it('click_to_lpv_low fires when clicks do not become page views', () => {
    const out = fired(rule('click_to_lpv_low').run(ctx({ meta: meta({ linkClicks: 100, lpv: 50 }) })));
    expect(out[0].severity).toBe('critical');
    expect(out[0].actions.join(' ')).toMatch(/LCP/);
    expect(pending(rule('click_to_lpv_low').run(ctx({ meta: meta({ linkClicks: 10, lpv: 2 }) })))).toBe(true);
  });

  it('bounce_high uses the bounce rate and the session minimum', () => {
    expect(fired(rule('bounce_high').run(ctx({ bounce: 70, counts: counts({ sessions: 50, bounced: 35 }) })))[0].severity).toBe('critical');
    expect(fired(rule('bounce_high').run(ctx({ bounce: 50, counts: counts({ sessions: 50, bounced: 25 }) })))[0].severity).toBe('warning');
    expect(fired(rule('bounce_high').run(ctx({ bounce: 30, counts: counts({ sessions: 50 }) })))).toHaveLength(0);
    expect(pending(rule('bounce_high').run(ctx({ bounce: 90, counts: counts({ sessions: 5 }) })))).toBe(true);
  });

  it('visit_to_start_low and start_to_submit_low', () => {
    expect(fired(rule('visit_to_start_low').run(ctx({ counts: counts({ sessions: 100, started: 10 }) })))[0].severity).toBe('critical');
    expect(fired(rule('visit_to_start_low').run(ctx({ counts: counts({ sessions: 100, started: 40 }) })))).toHaveLength(0);
    expect(fired(rule('start_to_submit_low').run(ctx({ counts: counts({ started: 40, submitted: 12 }) })))[0].severity).toBe('warning');
    expect(pending(rule('start_to_submit_low').run(ctx({ counts: counts({ started: 3, submitted: 0 }) })))).toBe(true);
  });

  it('step_drop names the step that loses too many people', () => {
    const out = fired(rule('step_drop').run(ctx({ steps: steps([100, 95, 90, 86, 82, 40, 38], 35, [{ field: 'files', label: 'Artwork missing', count: 9 }]) })));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('step_drop_5');
    expect(out[0].evidence).toMatch(/Artwork missing \(9\)/);
    expect(out[0].actions.length).toBeGreaterThanOrEqual(2);
    // 2x the average also fires even under the absolute limit
    const rel = fired(rule('step_drop').run(ctx({ steps: steps([100, 98, 96, 94, 92, 64, 63], 62) })));
    expect(rel.map((i) => i.id)).toEqual(['step_drop_5']);
    expect(pending(rule('step_drop').run(ctx({ steps: steps([10, 5, 2, 1, 1, 1, 1], 1) })))).toBe(true);
  });

  it('upload_fail names the failing file types', () => {
    const out = fired(rule('upload_fail').run(ctx({ uploads: { ok: ['png', 'png', 'png', 'png', 'png', 'png', 'png', 'png', 'ai'], failed: ['ai', 'ai'] } })));
    expect(out[0].evidence).toMatch(/AI 2 of 3 failed/);
    expect(fired(rule('upload_fail').run(ctx({ uploads: { ok: Array(30).fill('png'), failed: ['png'] } })))).toHaveLength(0);
    expect(pending(rule('upload_fail').run(ctx({ uploads: { ok: ['png'], failed: ['ai'] } })))).toBe(true);
  });

  it('lcp_slow fires above 2.5 seconds on mobile', () => {
    const sp = (p75: number, samples = 50) => [{ device: 'mobile' as const, samples, lcpMedian: p75 - 300, lcpP75: p75, fcpP75: null, ttfbP75: null, slow: p75 > 2500 }];
    expect(fired(rule('lcp_slow').run(ctx({ speed: sp(3000) })))[0].severity).toBe('warning');
    expect(fired(rule('lcp_slow').run(ctx({ speed: sp(4500) })))[0].severity).toBe('critical');
    expect(fired(rule('lcp_slow').run(ctx({ speed: sp(2000) })))).toHaveLength(0);
    expect(pending(rule('lcp_slow').run(ctx({ speed: sp(5000, 3) })))).toBe(true);
  });

  it('ad_cost_outlier suggests pausing an ad over 2x the best cost per RFQ', () => {
    const ads = [
      ad({ adId: '1', name: 'Best', spend: 100, submitted: 10, costPerRfq: 10 }),
      ad({ adId: '2', name: 'Costly', spend: 100, submitted: 2, costPerRfq: 50 }),
      ad({ adId: '3', name: 'Zero', spend: 30, submitted: 0 }),
      ad({ adId: '4', name: 'Tiny', spend: 5, submitted: 0 }),
    ];
    const out = fired(rule('ad_cost_outlier').run(ctx({ ads })));
    expect(out.map((i) => i.title)).toEqual(['Consider pausing "Costly"', 'Consider pausing "Zero"']);
    expect(pending(rule('ad_cost_outlier').run(ctx({ ads: [ads[0]] })))).toBe(true);
  });

  it('ad_winner suggests moving budget to a clearly cheaper ad', () => {
    const ads = [ad({ adId: '1', name: 'Winner', spend: 100, submitted: 10, costPerRfq: 10 }), ad({ adId: '2', name: 'Other', spend: 120, submitted: 3, costPerRfq: 40 })];
    const out = fired(rule('ad_winner').run(ctx({ ads })));
    expect(out[0].severity).toBe('good');
    expect(out[0].title).toMatch(/Winner/);
    const close = [ad({ adId: '1', spend: 100, submitted: 10, costPerRfq: 10 }), ad({ adId: '2', spend: 120, submitted: 10, costPerRfq: 12 })];
    expect(fired(rule('ad_winner').run(ctx({ ads: close })))).toHaveLength(0);
  });

  it('fatigue needs high frequency and a rising CPM', () => {
    const now = meta({ frequency: 3, spend: 150, impressions: 10000 });
    const before = meta({ spend: 100, impressions: 10000 });
    expect(fired(rule('fatigue').run(ctx({ meta: now, prevMeta: before })))).toHaveLength(1);
    expect(fired(rule('fatigue').run(ctx({ meta: now, prevMeta: meta({ spend: 150, impressions: 10000 }) })))).toHaveLength(0);
    expect(fired(rule('fatigue').run(ctx({ meta: meta({ frequency: 2, spend: 150 }), prevMeta: before })))).toHaveLength(0);
    expect(pending(rule('fatigue').run(ctx({ meta: meta({ impressions: 500, frequency: 3 }) })))).toBe(true);
  });

  it('improvements reports good news against the previous period', () => {
    const out = fired(
      rule('improvements').run(
        ctx({
          steps: steps([100, 95, 90, 85, 80, 75, 70], 60),
          prevSteps: steps([100, 95, 60, 50, 45, 40, 38], 30),
          counts: counts({ started: 100, submitted: 60 }),
          prevCounts: counts({ started: 100, submitted: 30 }),
          meta: meta({ spend: 600 }),
          prevMeta: meta({ spend: 600 }),
        }),
      ),
    );
    const ids = out.map((i) => i.id);
    expect(ids).toContain('improve_step_2'); // 90/95 vs 60/95
    expect(ids).toContain('improve_submit');
    expect(ids).toContain('improve_cost'); // $10 vs $20 per RFQ
    expect(out.every((i) => i.severity === 'good')).toBe(true);
  });

  it('runInsights sorts by severity and lists rules waiting for data', () => {
    const { insights, pending: wait } = runInsights(ctx({ meta: null, prevMeta: null, bounce: 80, counts: counts({ sessions: 100, bounced: 80, started: 50, submitted: 5 }) }));
    expect(insights[0].severity).toBe('critical');
    expect(wait.map((p) => p.id)).toContain('ctr_low');
    expect(wait.find((p) => p.id === 'ctr_low')!.needed).toMatch(/Meta/);
  });

  it('no UI copy uses long dashes (rules, advice and a full demo report)', () => {
    const now = Date.parse('2026-10-11T18:00:00Z');
    const range = resolveRange('last_7d', 'America/New_York', now);
    const prevR = previousRange(range, 'America/New_York');
    const cur = demoData(range, false, now);
    const old = demoData(prevR, true, now);
    const rep = buildReport({ events: cur.events, prevEvents: old.events, meta: cur.meta, prevMeta: old.meta, settings: S, filters: { campaign: null, adset: null, ad: null, all: false }, nameFilter: 'Leadlink', tz: 'America/New_York', now, range, prevRange: prevR, demo: true });
    expect(rep.insights.length).toBeGreaterThan(3);
    const text = JSON.stringify([RULES.map((r) => r.title), STEP_ADVICE, rep.insights, rep.pending, rep.rates, rep.stages, rep.steps]);
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});

export type { Session };
