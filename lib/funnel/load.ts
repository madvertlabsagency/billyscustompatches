import 'server-only';
import { db } from '../supabase';
import { getMetaData } from '../meta-ads';
import type { FunnelEvent } from './events';
import { demoData } from './demo';
import { previousRange, resolveRange, type Preset } from './range';
import { buildReport, type Filters, type Report } from './report';
import { mergeSettings, type Settings } from './settings';

const COLUMNS = 'session_id,visitor_id,event,step,meta,utm_source,utm_medium,utm_campaign,utm_content,fbclid,campaign_id,adset_id,ad_id,device,referrer,created_at';
const PAGE = 1000;
const MAX_ROWS = 100_000;

export const funnelTz = () => (process.env.FUNNEL_TIMEZONE || 'America/New_York').trim();
export const campaignFilter = () => (process.env.FUNNEL_CAMPAIGN_FILTER ?? 'Leadlink').trim();

export async function loadEvents(start: number, end: number): Promise<FunnelEvent[]> {
  const out: FunnelEvent[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db()
      .from('funnel_events')
      .select(COLUMNS)
      .gte('created_at', new Date(start).toISOString())
      .lt('created_at', new Date(end).toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error('funnel_events read failed: ' + error.message);
    out.push(...((data || []) as FunnelEvent[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const { data } = await db().from('app_state').select('value').eq('key', 'funnel_settings').maybeSingle();
  return mergeSettings(data?.value);
}

export async function saveSettings(values: Settings): Promise<void> {
  const { error } = await db().from('app_state').upsert({ key: 'funnel_settings', value: values });
  if (error) throw new Error('Saving settings failed: ' + error.message);
}

export type ReportQuery = { preset: Preset; from?: string | null; to?: string | null; filters: Filters; demo: boolean };

export async function getReport(q: ReportQuery): Promise<Report> {
  const tz = funnelTz();
  const now = Date.now();
  const range = resolveRange(q.preset, tz, now, q.from, q.to);
  const prev = previousRange(range, tz);
  const nameFilter = campaignFilter();
  const settings = await loadSettings().catch(() => mergeSettings(null));
  const metaFilter = q.filters.all ? null : nameFilter || null;

  if (q.demo) {
    const cur = demoData(range, false, now);
    const old = demoData(prev, true, now);
    return buildReport({ events: cur.events, prevEvents: old.events, meta: cur.meta, prevMeta: old.meta, settings, filters: q.filters, nameFilter, tz, now, range, prevRange: prev, demo: true });
  }
  const [events, prevEvents, meta, prevMeta] = await Promise.all([
    loadEvents(range.start, range.end),
    loadEvents(prev.start, prev.end),
    getMetaData(range.since, range.until, metaFilter),
    getMetaData(prev.since, prev.until, metaFilter),
  ]);
  return buildReport({ events, prevEvents, meta, prevMeta, settings, filters: q.filters, nameFilter, tz, now, range, prevRange: prev });
}
