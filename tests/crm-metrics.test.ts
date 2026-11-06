import { describe, expect, it } from 'vitest';
import { computeMetrics, pct, sourceLabel, type MetricRow } from '../lib/crm-metrics';

const row = (p: Partial<MetricRow>): MetricRow => ({
  created_at: '2026-11-01T00:00:00Z',
  lead_status: 'new',
  opportunity_value: null,
  quoted_at: null,
  won_at: null,
  lost_at: null,
  assignee_id: null,
  source: 'funnel',
  tracking: {},
  ...p,
});

describe('CRM dashboard metrics', () => {
  const rows = [
    row({ lead_status: 'new', opportunity_value: 200, assignee_id: 'a', tracking: { utm_source: 'facebook' } }),
    row({ lead_status: 'contacted', opportunity_value: '150', assignee_id: 'a' }),
    row({ lead_status: 'quoted', opportunity_value: 250, quoted_at: '2026-11-02T00:00:00Z', assignee_id: 'b' }),
    row({ lead_status: 'won', opportunity_value: 500, quoted_at: '2026-11-02T00:00:00Z', won_at: '2026-11-03T00:00:00Z', assignee_id: 'b' }),
    row({ lead_status: 'lost', opportunity_value: 300, quoted_at: '2026-11-02T00:00:00Z', lost_at: '2026-11-03T00:00:00Z' }),
    row({ lead_status: 'lost', opportunity_value: null, source: 'manual' }),
  ];
  const m = computeMetrics(rows);

  it('adds up values by stage group', () => {
    expect(m.total.leads).toBe(6);
    expect(m.total.open).toBe(3);
    expect(m.total.pipelineValue).toBe(600);
    expect(m.total.wonRevenue).toBe(500);
    expect(m.total.lostRevenue).toBe(300);
  });

  it('computes the sales ratios', () => {
    expect(m.total.reachedQuote).toBe(3);
    expect(m.conversion).toBeCloseTo(1 / 6);
    expect(m.leadToQuote).toBeCloseTo(3 / 6);
    expect(m.quoteToSale).toBeCloseTo(1 / 3);
    expect(m.winRate).toBeCloseTo(1 / 3);
    expect(m.avgDeal).toBe(500);
  });

  it('splits by owner and by source', () => {
    expect(m.byOwner.get('a')!.pipelineValue).toBe(350);
    expect(m.byOwner.get('b')!.won).toBe(1);
    expect(m.byOwner.get('')!.leads).toBe(2);
    expect(m.bySource.get('Meta ads')!.leads).toBe(1);
    expect(m.bySource.get('Added manually')!.lost).toBe(1);
  });

  it('handles an empty CRM without dividing by zero', () => {
    const e = computeMetrics([]);
    expect(e.conversion).toBeNull();
    expect(pct(e.conversion)).toBe('n/a');
    expect(e.avgDeal).toBeNull();
  });

  it('labels sources', () => {
    expect(sourceLabel({ source: 'funnel', tracking: { utm_source: 'fb' } })).toBe('Meta ads');
    expect(sourceLabel({ source: 'funnel', tracking: {} })).toBe('Website (direct)');
  });
});
