// Funnel math: stages, key rates, step drop off, page speed, breakdowns and the activity feed.
// Pure functions over sessions and Meta rows, so they are easy to test and reuse in demo mode.
import { STEP_LABELS } from './events';
import { hourInTz } from './range';
import { isBounce, isEngaged, type Session } from './sessions';
import type { MetaAdRow, MetaTotals } from './meta-types';
import type { Settings } from './settings';

export type Status = 'good' | 'warning' | 'critical' | 'none';

export const ratio = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null);
export const cost = (spend: number, count: number): number | null => (spend > 0 && count > 0 ? spend / count : null);

export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = (p / 100) * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}
export const median = (values: number[]) => percentile(values, 50);

// Higher is better when good > poor; lower is better when good < poor.
export function rateStatus(value: number | null, good: number, poor: number): Status {
  if (value === null) return 'none';
  if (good >= poor) return value >= good ? 'good' : value < poor ? 'critical' : 'warning';
  return value <= good ? 'good' : value > poor ? 'critical' : 'warning';
}

export type MetaSums = { spend: number; impressions: number; linkClicks: number; lpv: number; leads: number; reach: number; frequency: number };

export function sumMeta(ads: MetaAdRow[], totals: MetaTotals | null): MetaSums {
  const s = ads.reduce(
    (a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, linkClicks: a.linkClicks + r.link_clicks, lpv: a.lpv + r.landing_page_views, leads: a.leads + r.leads }),
    { spend: 0, impressions: 0, linkClicks: 0, lpv: 0, leads: 0 },
  );
  // Reach does not add up across ads; use the account total when it covers the same ads.
  const reach = totals?.reach ?? Math.max(0, ...ads.map((r) => r.reach));
  const frequency = totals?.frequency ?? (reach > 0 ? s.impressions / reach : 0);
  return { ...s, reach, frequency };
}

// ---------- funnel ----------

export type Stage = { key: string; label: string; count: number | null; source: 'meta' | 'site'; fromPrev: number | null; costPer: number | null };

export type Counts = {
  sessions: number;
  engaged: number;
  bounced: number;
  sawForm: number;
  started: number;
  reached: number[]; // index 1 to 7
  submitted: number;
  qualified: number;
};

export function countSessions(sessions: Session[], engagedSeconds: number): Counts {
  const views = sessions.filter((x) => x.pageView);
  const started = sessions.filter((x) => x.started);
  const reached = [0];
  for (let step = 1; step <= 7; step++) reached.push(started.filter((x) => x.furthestStep >= step).length);
  return {
    sessions: views.length,
    engaged: views.filter((x) => isEngaged(x, engagedSeconds)).length,
    bounced: views.filter((x) => isBounce(x, engagedSeconds)).length,
    sawForm: sessions.filter((x) => x.sawForm).length,
    started: started.length,
    reached,
    submitted: sessions.filter((x) => x.submitted).length,
    qualified: sessions.filter((x) => x.qualified).length,
  };
}

export function buildStages(c: Counts, meta: MetaSums | null): Stage[] {
  const spend = meta?.spend ?? 0;
  const raw: Omit<Stage, 'fromPrev' | 'costPer'>[] = [
    ...(meta
      ? [
          { key: 'impressions', label: 'Impressions', count: meta.impressions, source: 'meta' as const },
          { key: 'link_clicks', label: 'Link clicks', count: meta.linkClicks, source: 'meta' as const },
          { key: 'lpv', label: 'Landing page views (Meta)', count: meta.lpv, source: 'meta' as const },
        ]
      : []),
    { key: 'sessions', label: 'Sessions (our tracking)', count: c.sessions, source: 'site' },
    { key: 'engaged', label: 'Engaged sessions', count: c.engaged, source: 'site' },
    { key: 'started', label: 'Quote started', count: c.started, source: 'site' },
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ key: `step${i}`, label: STEP_LABELS[i], count: c.reached[i], source: 'site' as const })),
    { key: 'submitted', label: 'Submitted RFQ', count: c.submitted, source: 'site' },
    { key: 'qualified', label: 'Qualified RFQ', count: c.qualified, source: 'site' },
  ];
  return raw.map((st, i) => {
    const prev = i > 0 ? raw[i - 1].count : null;
    return {
      ...st,
      fromPrev: prev !== null && st.count !== null ? ratio(st.count, prev) : null,
      costPer: st.key === 'impressions' ? (meta && meta.impressions ? (spend / meta.impressions) * 1000 : null) : cost(spend, st.count ?? 0),
    };
  });
}

// ---------- key rates ----------

export type KeyRate = { key: string; label: string; value: number | null; unit: '%' | '$'; status: Status; lowSample: boolean; good: number; poor: number; better: 'higher' | 'lower'; prev: number | null; change: number | null; hint: string };

export type RateInputs = { counts: Counts; meta: MetaSums | null; bounce: number | null };

export function rateValues(r: RateInputs): Record<string, number | null> {
  const m = r.meta;
  const c = r.counts;
  return {
    ctr: m ? ratio(m.linkClicks, m.impressions) : null,
    clickToLpv: m ? ratio(m.lpv, m.linkClicks) : null,
    bounce: r.bounce,
    lpvToStart: ratio(c.started, c.sessions),
    startToSubmit: ratio(c.submitted, c.started),
    costPerLpv: m ? cost(m.spend, m.lpv) : null,
    costPerRfq: m ? cost(m.spend, c.submitted) : null,
    costPerQualified: m ? cost(m.spend, c.qualified) : null,
  };
}

// `sample` is the denominator that must reach a minimum before the status is shown.
const RATE_DEFS: { key: string; label: string; unit: '%' | '$'; good: keyof Settings; poor: keyof Settings; hint: string; sample: (r: RateInputs) => number; min: keyof Settings }[] = [
  { key: 'ctr', label: 'CTR (link)', unit: '%', good: 'ctrGood', poor: 'ctrPoor', hint: 'Link clicks per 100 impressions', sample: (r) => r.meta?.impressions ?? 0, min: 'minImpressions' },
  { key: 'clickToLpv', label: 'Click to landing page view', unit: '%', good: 'clickToLpvGood', poor: 'clickToLpvPoor', hint: 'Clicks that waited for the page to load', sample: (r) => r.meta?.linkClicks ?? 0, min: 'minClicks' },
  { key: 'bounce', label: 'Bounce rate', unit: '%', good: 'bounceGood', poor: 'bouncePoor', hint: 'Visits with no scroll, click or 10 seconds', sample: (r) => r.counts.sessions, min: 'minSessions' },
  { key: 'lpvToStart', label: 'Visit to quote start', unit: '%', good: 'lpvToStartGood', poor: 'lpvToStartPoor', hint: 'Sessions that answered the first question', sample: (r) => r.counts.sessions, min: 'minSessions' },
  { key: 'startToSubmit', label: 'Quote start to submit', unit: '%', good: 'startToSubmitGood', poor: 'startToSubmitPoor', hint: 'Started quotes that were sent', sample: (r) => r.counts.started, min: 'minStarts' },
  { key: 'costPerLpv', label: 'Cost per landing page view', unit: '$', good: 'costPerLpvGood', poor: 'costPerLpvPoor', hint: 'Spend divided by Meta landing page views', sample: (r) => r.meta?.linkClicks ?? 0, min: 'minClicks' },
  { key: 'costPerRfq', label: 'Cost per RFQ', unit: '$', good: 'costPerRfqGood', poor: 'costPerRfqPoor', hint: 'Spend divided by submitted quotes', sample: (r) => r.counts.started, min: 'minStarts' },
  { key: 'costPerQualified', label: 'Cost per qualified RFQ', unit: '$', good: 'costPerQualifiedGood', poor: 'costPerQualifiedPoor', hint: 'Spend divided by High and Very high quotes', sample: (r) => r.counts.started, min: 'minStarts' },
];

export const changePct = (now: number | null, before: number | null): number | null =>
  now === null || before === null || before === 0 ? null : ((now - before) / Math.abs(before)) * 100;

export function keyRates(cur: RateInputs, prev: RateInputs, s: Settings): KeyRate[] {
  const a = rateValues(cur);
  const b = rateValues(prev);
  return RATE_DEFS.map((d) => {
    const good = s[d.good];
    const poor = s[d.poor];
    const lowSample = d.sample(cur) < s[d.min];
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      value: a[d.key],
      status: lowSample ? 'none' : rateStatus(a[d.key], good, poor),
      lowSample,
      good,
      poor,
      better: good >= poor ? 'higher' : 'lower',
      prev: b[d.key],
      change: changePct(a[d.key], b[d.key]),
      hint: d.key === 'bounce' ? `Visits with no scroll past 50%, no click and under ${s.engagedSeconds} seconds` : d.hint,
    };
  });
}

// ---------- step drop off ----------

export const FIELD_LABELS: Record<string, string> = {
  type: 'No patch type chosen',
  qty: 'No quantity chosen',
  w: 'Size missing',
  backing: 'No backing chosen',
  files: 'Artwork missing or still uploading',
  email: 'Email invalid',
  deadline: 'No deadline chosen',
  date: 'Deadline date missing',
  first: 'First name missing',
  last: 'Last name missing',
  phone: 'Phone number invalid',
  contact: 'No contact method',
  consent: 'Consent box not ticked',
};

export type StepRow = { step: number; label: string; reached: number; next: number; lostPct: number | null; medianSec: number | null; errors: { field: string; label: string; count: number }[] };

export function stepRows(sessions: Session[], c: Counts): StepRow[] {
  const rows: StepRow[] = [];
  for (let step = 1; step <= 7; step++) {
    const reached = c.reached[step];
    const next = step < 7 ? c.reached[step + 1] : c.submitted;
    const times = sessions.map((x) => x.stepMs[step]).filter((v): v is number => typeof v === 'number');
    const errCount = new Map<string, number>();
    for (const x of sessions) for (const e of x.validationErrors) if (e.step === step) errCount.set(e.field, (errCount.get(e.field) || 0) + 1);
    const errors = [...errCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([field, count]) => ({ field, label: FIELD_LABELS[field] || field, count }));
    const med = median(times);
    rows.push({ step, label: STEP_LABELS[step], reached, next, lostPct: reached > 0 ? (1 - next / reached) * 100 : null, medianSec: med === null ? null : med / 1000, errors });
  }
  return rows;
}

// ---------- page speed ----------

export type SpeedRow = { device: 'mobile' | 'desktop'; samples: number; lcpMedian: number | null; lcpP75: number | null; fcpP75: number | null; ttfbP75: number | null; slow: boolean };

export function speedRows(sessions: Session[], s: Settings): SpeedRow[] {
  return (['mobile', 'desktop'] as const).map((device) => {
    const group = sessions.filter((x) => (device === 'mobile' ? x.device !== 'desktop' : x.device === 'desktop'));
    const lcp = group.map((x) => x.lcp).filter((v): v is number => v !== null);
    const p75 = percentile(lcp, 75);
    return {
      device,
      samples: lcp.length,
      lcpMedian: median(lcp),
      lcpP75: p75,
      fcpP75: percentile(group.map((x) => x.fcp).filter((v): v is number => v !== null), 75),
      ttfbP75: percentile(group.map((x) => x.ttfb).filter((v): v is number => v !== null), 75),
      slow: p75 !== null && p75 > s.lcpGoodMs,
    };
  });
}

// ---------- breakdowns ----------

export type AdRow = {
  adId: string;
  name: string;
  campaign: string;
  adset: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number | null;
  lpv: number;
  frequency: number;
  sessions: number;
  started: number;
  submitted: number;
  qualified: number;
  costPerRfq: number | null;
  costPerQualified: number | null;
  conv: number | null;
};

export function adRows(sessions: Session[], ads: MetaAdRow[]): AdRow[] {
  const byAd = new Map<string, Session[]>();
  for (const x of sessions) if (x.adId) byAd.set(x.adId, [...(byAd.get(x.adId) || []), x]);
  const ids = new Set([...ads.map((a) => a.ad_id), ...byAd.keys()]);
  return [...ids]
    .map((id) => {
      const m = ads.filter((a) => a.ad_id === id);
      const ss = byAd.get(id) || [];
      const spend = m.reduce((t, a) => t + a.spend, 0);
      const impressions = m.reduce((t, a) => t + a.impressions, 0);
      const linkClicks = m.reduce((t, a) => t + a.link_clicks, 0);
      const submitted = ss.filter((x) => x.submitted).length;
      const qualified = ss.filter((x) => x.qualified).length;
      const views = ss.filter((x) => x.pageView).length;
      return {
        adId: id,
        name: m[0]?.ad_name || ss.find((x) => x.utmContent)?.utmContent || `Ad ${id}`,
        campaign: m[0]?.campaign_name || ss.find((x) => x.utmCampaign)?.utmCampaign || '',
        adset: m[0]?.adset_name || '',
        spend,
        impressions,
        linkClicks,
        ctr: ratio(linkClicks, impressions),
        lpv: m.reduce((t, a) => t + a.landing_page_views, 0),
        frequency: m[0]?.frequency || 0,
        sessions: views,
        started: ss.filter((x) => x.started).length,
        submitted,
        qualified,
        costPerRfq: cost(spend, submitted),
        costPerQualified: cost(spend, qualified),
        conv: ratio(submitted, views),
      };
    })
    .sort((a, b) => b.spend - a.spend || b.sessions - a.sessions);
}

export type GroupRow = { key: string; sessions: number; bounce: number | null; started: number; submitted: number; startRate: number | null; submitRate: number | null };

function groupRows(sessions: Session[], keyOf: (x: Session) => string | null, s: Settings, order?: string[]): GroupRow[] {
  const groups = new Map<string, Session[]>();
  for (const x of sessions) {
    const k = keyOf(x);
    if (k !== null) groups.set(k, [...(groups.get(k) || []), x]);
  }
  const rows = [...groups.entries()].map(([key, ss]) => {
    const views = ss.filter((x) => x.pageView);
    const started = ss.filter((x) => x.started).length;
    const submitted = ss.filter((x) => x.submitted).length;
    return {
      key,
      sessions: views.length || ss.length,
      bounce: views.length ? ratio(views.filter((x) => isBounce(x, s.engagedSeconds)).length, views.length) : null,
      started,
      submitted,
      startRate: ratio(started, views.length || ss.length),
      submitRate: ratio(submitted, started),
    };
  });
  if (order) return order.map((k) => rows.find((r) => r.key === k)).filter((r): r is GroupRow => !!r);
  return rows.sort((a, b) => b.sessions - a.sessions);
}

export type HourRow = { hour: number; sessions: number; started: number; submitted: number };

export function hourRows(sessions: Session[], tz: string): HourRow[] {
  const rows: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, started: 0, submitted: 0 }));
  for (const x of sessions) {
    const r = rows[hourInTz(x.start, tz)];
    if (x.pageView) r.sessions++;
    if (x.started) r.started++;
    if (x.submitted) r.submitted++;
  }
  return rows;
}

const QTY_ORDER = ['10 to 24', '25 to 49', '50 to 99', '100 to 249', '250 to 499', '500 to 999', '1,000+', 'Not sure yet'];

export function breakdowns(sessions: Session[], s: Settings, tz: string) {
  return {
    device: groupRows(sessions, (x) => x.device || 'unknown', s, ['mobile', 'tablet', 'desktop', 'unknown']),
    patchType: groupRows(sessions.filter((x) => x.patchType), (x) => x.patchType, s),
    quantity: groupRows(sessions.filter((x) => x.quantity), (x) => x.quantity, s, QTY_ORDER),
    hour: hourRows(sessions, tz),
  };
}

// ---------- activity feed ----------

export type FeedRow = { id: string; at: number; source: string; device: string; furthest: number; outcome: string; tone: Status };

export function feedRows(sessions: Session[], ads: MetaAdRow[], s: Settings, now: number, limit = 20): FeedRow[] {
  const adName = new Map(ads.map((a) => [a.ad_id, a.ad_name]));
  return [...sessions]
    .filter((x) => x.pageView || x.submitted)
    .sort((a, b) => b.start - a.start)
    .slice(0, limit)
    .map((x) => {
      const source = (x.adId && adName.get(x.adId)) || x.utmContent || (x.utmSource ? `${x.utmSource}${x.utmCampaign ? `, ${x.utmCampaign}` : ''}` : x.referrer || 'Direct');
      let outcome = 'Browsing';
      let tone: Status = 'none';
      if (x.qualified) [outcome, tone] = ['Qualified RFQ', 'good'];
      else if (x.submitted) [outcome, tone] = ['Submitted RFQ', 'good'];
      else if (x.started && now - x.last < 30 * 60_000) [outcome, tone] = [`On step ${x.furthestStep} now`, 'none'];
      else if (x.started) [outcome, tone] = [`Left at step ${x.furthestStep}`, 'warning'];
      else if (isBounce(x, s.engagedSeconds) && now - x.last > 60_000) [outcome, tone] = ['Bounced', 'critical'];
      else if (!x.started && now - x.last > 30 * 60_000) [outcome, tone] = ['Left without starting', 'warning'];
      return { id: x.id.slice(-6), at: x.start, source, device: x.device || 'unknown', furthest: x.furthestStep, outcome, tone };
    });
}
