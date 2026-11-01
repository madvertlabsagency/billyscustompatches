// Builds everything the Funnel Health dashboard shows from raw events and Meta rows.
import type { FunnelEvent } from './events';
import type { MetaAdRow, MetaData } from './meta-types';
import type { Range } from './range';
import type { Settings } from './settings';
import { buildSessions, bounceRate, type Session } from './sessions';
import { runInsights, type Insight, type Pending } from './insights';
import {
  adRows,
  breakdowns,
  buildStages,
  changePct,
  countSessions,
  feedRows,
  keyRates,
  speedRows,
  stepRows,
  sumMeta,
  type AdRow,
  type Counts,
  type FeedRow,
  type GroupRow,
  type HourRow,
  type KeyRate,
  type SpeedRow,
  type Stage,
  type StepRow,
} from './metrics';

export type Filters = { campaign: string | null; adset: string | null; ad: string | null; all: boolean };
export type Option = { id: string; name: string; parent?: string };

export type Report = {
  generatedAt: string;
  demo: boolean;
  range: Range;
  prevRange: Range;
  filters: Filters;
  nameFilter: string;
  meta: { configured: boolean; error?: string; stale?: boolean; fetchedAt: string | null };
  options: { campaigns: Option[]; adsets: Option[]; ads: Option[] };
  counts: Counts;
  stages: (Stage & { prevCount: number | null; change: number | null })[];
  rates: KeyRate[];
  steps: StepRow[];
  sawForm: number;
  speed: SpeedRow[];
  ads: AdRow[];
  device: GroupRow[];
  patchType: GroupRow[];
  quantity: GroupRow[];
  hour: HourRow[];
  feed: FeedRow[];
  insights: Insight[];
  pending: Pending[];
};

export type ReportInput = {
  events: FunnelEvent[];
  prevEvents: FunnelEvent[];
  meta: MetaData;
  prevMeta: MetaData;
  settings: Settings;
  filters: Filters;
  nameFilter: string;
  tz: string;
  now: number;
  range: Range;
  prevRange: Range;
  demo?: boolean;
};

function filterAds(ads: MetaAdRow[], f: Filters): MetaAdRow[] {
  return ads.filter((a) => (!f.campaign || a.campaign_id === f.campaign) && (!f.adset || a.adset_id === f.adset) && (!f.ad || a.ad_id === f.ad));
}

// Sessions that belong to the selected ads. With "all traffic" off, only sessions from the
// filtered (Leadlink) campaigns count, matched by campaign id or by campaign name in utm_campaign.
export function filterSessions(sessions: Session[], f: Filters, ads: MetaAdRow[], nameFilter: string): Session[] {
  const campaignNames = new Map(ads.map((a) => [a.campaign_id, a.campaign_name]));
  const paidIds = new Set(ads.map((a) => a.campaign_id));
  const needle = nameFilter.toLowerCase();
  return sessions.filter((x) => {
    if (f.ad && x.adId !== f.ad) return false;
    if (f.adset && x.adsetId !== f.adset) return false;
    if (f.campaign && x.campaignId !== f.campaign && !(x.utmCampaign && x.utmCampaign === campaignNames.get(f.campaign))) return false;
    if (!f.all && !f.campaign && !f.adset && !f.ad) {
      const byId = !!x.campaignId && paidIds.has(x.campaignId);
      const byName = !!needle && !!x.utmCampaign && x.utmCampaign.toLowerCase().includes(needle);
      if (!byId && !byName) return false;
    }
    return true;
  });
}

function options(ads: MetaAdRow[], sessions: Session[]): Report['options'] {
  const c = new Map<string, Option>();
  const s = new Map<string, Option>();
  const a = new Map<string, Option>();
  for (const r of ads) {
    c.set(r.campaign_id, { id: r.campaign_id, name: r.campaign_name });
    s.set(r.adset_id, { id: r.adset_id, name: r.adset_name, parent: r.campaign_id });
    a.set(r.ad_id, { id: r.ad_id, name: r.ad_name, parent: r.adset_id });
  }
  for (const x of sessions) {
    if (x.campaignId && !c.has(x.campaignId)) c.set(x.campaignId, { id: x.campaignId, name: x.utmCampaign || `Campaign ${x.campaignId}` });
    if (x.adsetId && !s.has(x.adsetId)) s.set(x.adsetId, { id: x.adsetId, name: `Ad set ${x.adsetId}`, parent: x.campaignId || undefined });
    if (x.adId && !a.has(x.adId)) a.set(x.adId, { id: x.adId, name: x.utmContent || `Ad ${x.adId}`, parent: x.adsetId || undefined });
  }
  const sort = (m: Map<string, Option>) => [...m.values()].sort((p, q) => p.name.localeCompare(q.name));
  return { campaigns: sort(c), adsets: sort(s), ads: sort(a) };
}

export function buildReport(i: ReportInput): Report {
  const s = i.settings;
  const allSessions = buildSessions(i.events);
  const allPrev = buildSessions(i.prevEvents);
  const ads = filterAds(i.meta.ads, i.filters);
  const prevAds = filterAds(i.prevMeta.ads, i.filters);
  const sessions = filterSessions(allSessions, i.filters, [...i.meta.ads, ...i.prevMeta.ads], i.nameFilter);
  const prevSessions = filterSessions(allPrev, i.filters, [...i.meta.ads, ...i.prevMeta.ads], i.nameFilter);
  const narrowed = !!(i.filters.campaign || i.filters.adset || i.filters.ad);
  const meta = i.meta.configured && i.meta.ads.length ? sumMeta(ads, narrowed ? null : i.meta.totals) : null;
  const prevMeta = i.prevMeta.configured && i.prevMeta.ads.length ? sumMeta(prevAds, narrowed ? null : i.prevMeta.totals) : null;

  const counts = countSessions(sessions, s.engagedSeconds);
  const prevCounts = countSessions(prevSessions, s.engagedSeconds);
  const bounce = bounceRate(sessions, s.engagedSeconds);
  const prevBounce = bounceRate(prevSessions, s.engagedSeconds);

  const stages = buildStages(counts, meta);
  const prevStages = buildStages(prevCounts, prevMeta);
  const steps = stepRows(sessions, counts);
  const prevSteps = stepRows(prevSessions, prevCounts);
  const speed = speedRows(sessions, s);
  const adTable = adRows(sessions, ads);
  const bd = breakdowns(sessions, s, i.tz);
  const uploads = { ok: sessions.flatMap((x) => x.uploadsOk), failed: sessions.flatMap((x) => x.uploadsFailed) };

  const { insights, pending } = runInsights({ s, meta, prevMeta, counts, prevCounts, bounce, prevBounce, steps, prevSteps, speed, ads: adTable, uploads });

  return {
    generatedAt: new Date(i.now).toISOString(),
    demo: !!i.demo,
    range: i.range,
    prevRange: i.prevRange,
    filters: i.filters,
    nameFilter: i.nameFilter,
    meta: { configured: i.meta.configured, error: i.meta.error, stale: i.meta.stale, fetchedAt: i.meta.fetchedAt },
    options: options(i.meta.ads, i.filters.all ? allSessions : sessions),
    counts,
    stages: stages.map((st) => {
      const p = prevStages.find((x) => x.key === st.key)?.count ?? null;
      return { ...st, prevCount: p, change: changePct(st.count, p) };
    }),
    rates: keyRates({ counts, meta, bounce }, { counts: prevCounts, meta: prevMeta, bounce: prevBounce }, s),
    steps,
    sawForm: counts.sawForm,
    speed,
    ads: adTable,
    device: bd.device,
    patchType: bd.patchType,
    quantity: bd.quantity,
    hour: bd.hour,
    feed: feedRows(sessions, i.meta.ads, s, i.now),
    insights,
    pending,
  };
}
