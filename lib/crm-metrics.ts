// Dashboard numbers for the partner CRM. Pure functions, so they can be tested without a database.
export type MetricRow = {
  created_at: string;
  lead_status: string | null;
  opportunity_value: number | string | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  assignee_id: string | null;
  source: string | null;
  tracking: Record<string, string> | null;
};

export type Bucket = { leads: number; open: number; won: number; lost: number; reachedQuote: number; pipelineValue: number; wonRevenue: number; lostRevenue: number };

const OPEN = new Set(['new', 'contacted', 'quoted']);

const num = (v: number | string | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function emptyBucket(): Bucket {
  return { leads: 0, open: 0, won: 0, lost: 0, reachedQuote: 0, pipelineValue: 0, wonRevenue: 0, lostRevenue: 0 };
}

export function add(b: Bucket, r: MetricRow): void {
  const s = r.lead_status || 'new';
  const v = num(r.opportunity_value);
  b.leads++;
  if (OPEN.has(s)) {
    b.open++;
    b.pipelineValue += v;
  }
  if (s === 'won') {
    b.won++;
    b.wonRevenue += v;
  }
  if (s === 'lost') {
    b.lost++;
    b.lostRevenue += v;
  }
  // A lead "reached quote" once a quote was sent, even if it was later won or lost.
  if (r.quoted_at || s === 'quoted' || s === 'won') b.reachedQuote++;
}

export function sourceLabel(r: Pick<MetricRow, 'source' | 'tracking'>): string {
  if (r.source === 'manual') return 'Added manually';
  const s = (r.tracking?.utm_source || '').toLowerCase();
  if (!s) return 'Website (direct)';
  if (['fb', 'facebook', 'ig', 'instagram', 'meta'].includes(s)) return 'Meta ads';
  if (s.includes('google')) return 'Google';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function computeMetrics(rows: MetricRow[]) {
  const total = emptyBucket();
  const byStage: Record<string, { count: number; value: number }> = {};
  const byOwner = new Map<string, Bucket>();
  const bySource = new Map<string, Bucket>();
  let valuedWon = 0;
  let unvaluedOpen = 0;
  for (const r of rows) {
    add(total, r);
    const s = r.lead_status || 'new';
    byStage[s] ??= { count: 0, value: 0 };
    byStage[s].count++;
    byStage[s].value += num(r.opportunity_value);
    const owner = r.assignee_id || '';
    if (!byOwner.has(owner)) byOwner.set(owner, emptyBucket());
    add(byOwner.get(owner)!, r);
    const src = sourceLabel(r);
    if (!bySource.has(src)) bySource.set(src, emptyBucket());
    add(bySource.get(src)!, r);
    if (s === 'won' && num(r.opportunity_value) > 0) valuedWon++;
    if (OPEN.has(s) && !num(r.opportunity_value)) unvaluedOpen++;
  }
  return {
    total,
    byStage,
    byOwner,
    bySource,
    unvaluedOpen,
    conversion: ratio(total.won, total.leads),
    leadToQuote: ratio(total.reachedQuote, total.leads),
    quoteToSale: ratio(total.won, total.reachedQuote),
    winRate: ratio(total.won, total.won + total.lost),
    avgDeal: valuedWon ? total.wonRevenue / valuedWon : null,
  };
}

export const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 1000) / 10}%`);
export const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
